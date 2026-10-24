-- ReviewLens schema v2 (Phase 2). Run AFTER 0001_init.sql, once.
-- Supabase may warn about "destructive" statements: this file only drops and re-creates
-- CHECK constraints so they can allow Flipkart and user-supplied data. It does not delete rows.
--
-- What changes:
--   * products/reviews: marketplace can be amazon.in OR flipkart; "asin" becomes "external_id"
--     (ASIN for amazon.in, pid for flipkart)
--   * products get a verification_level: verified / ai_grounded / link_only
--   * reviews get is_public (pasted reviews are never public) and analysis-attempt tracking
--   * run log, plus three SQL functions used by the daily analysis job

-- ---------------------------------------------------------------- products
alter table products drop constraint products_source_check;
alter table products drop constraint products_asin_check;
alter table products drop constraint products_data_source_type_check;
alter table products drop constraint products_identity_required;

alter table products rename column asin to external_id;
alter table products rename constraint products_source_asin_unique to products_source_external_id_unique;
alter table products rename constraint products_id_asin_unique to products_id_external_id_unique;

alter table products add column verification_level text not null default 'link_only'
  check (verification_level in ('verified','ai_grounded','link_only'));
update products set verification_level = 'verified' where identity_verified = true;

alter table products add constraint products_source_check check (source in ('amazon.in','flipkart'));
alter table products add constraint products_external_id_check check (
  (source = 'amazon.in' and external_id ~ '^[A-Z0-9]{10}$')
  or (source = 'flipkart' and external_id ~ '^[A-Z0-9]{16}$')
);
alter table products add constraint products_data_source_type_check check (
  data_source_type in ('live_retrieval','cached','dataset','authorized_api','manual_import','user_supplied')
);
-- Only a product whose identity was really verified may claim it; everything else must say so.
alter table products add constraint products_verification_consistent check (
  (verification_level = 'verified' and identity_verified = true)
  or (verification_level <> 'verified' and identity_verified = false and url_verified = false)
);

-- ----------------------------------------------------------------- reviews
alter table reviews drop constraint reviews_asin_check;
alter table reviews drop constraint reviews_source_check;
alter table reviews drop constraint reviews_data_source_type_check;

alter table reviews rename column asin to external_id;
alter table reviews rename constraint reviews_product_asin_fk to reviews_product_external_id_fk;

alter table reviews add constraint reviews_source_check check (source in ('amazon.in','flipkart'));
alter table reviews add constraint reviews_external_id_check check (external_id ~ '^([A-Z0-9]{10}|[A-Z0-9]{16})$');
alter table reviews add constraint reviews_data_source_type_check check (
  data_source_type in ('live_retrieval','cached','dataset','authorized_api','manual_import','user_pasted','site_user')
);
alter table reviews add column is_public boolean not null default true;
alter table reviews add constraint reviews_pasted_not_public check (data_source_type <> 'user_pasted' or is_public = false);
alter table reviews add column analysis_attempts smallint not null default 0 check (analysis_attempts >= 0);
alter table reviews add column last_analysis_error text;

-- ----------------------------------------------------------------- analysis
alter table review_analysis rename column heuristic_signals to risk_breakdown;
alter table product_analysis add column details jsonb not null default '{}'::jsonb;

create table if not exists analysis_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null check (trigger in ('cron','manual')),
  model text not null,
  prompt_version text not null,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  reviews_attempted integer not null default 0,
  reviews_succeeded integer not null default 0,
  reviews_failed integer not null default 0,
  note text
);
alter table analysis_runs enable row level security;

-- ---------------------------------------------------------------- functions
create or replace function reviews_needing_analysis(p_model text, p_prompt text, p_max_attempts int, p_limit int)
returns setof reviews language sql stable as $$
  select r.* from reviews r
  where r.analysis_attempts < p_max_attempts
    and not exists (
      select 1 from review_analysis a
      where a.review_id = r.id and a.model = p_model and a.prompt_version = p_prompt
    )
  order by r.created_at asc
  limit p_limit;
$$;

create or replace function mark_review_analysis_failed(p_ids uuid[], p_error text)
returns void language sql as $$
  update reviews
     set analysis_attempts = analysis_attempts + 1,
         last_analysis_error = left(p_error, 500)
   where id = any(p_ids);
$$;

-- Writes the product-level analysis and its aspect rows in ONE transaction.
create or replace function save_product_aggregates(p_product_id uuid, p_analysis jsonb, p_aspects jsonb)
returns void language plpgsql as $$
begin
  insert into product_analysis (
    product_id, reviews_total, reviews_analyzed, positive_count, neutral_count, negative_count,
    avg_sentiment_confidence, authenticity_distribution, details, model, computed_at
  ) values (
    p_product_id,
    (p_analysis->>'reviews_total')::int,
    (p_analysis->>'reviews_analyzed')::int,
    (p_analysis->>'positive_count')::int,
    (p_analysis->>'neutral_count')::int,
    (p_analysis->>'negative_count')::int,
    nullif(p_analysis->>'avg_sentiment_confidence', '')::numeric,
    coalesce(p_analysis->'authenticity_distribution', '{}'::jsonb),
    coalesce(p_analysis->'details', '{}'::jsonb),
    p_analysis->>'model',
    now()
  )
  on conflict (product_id) do update set
    reviews_total = excluded.reviews_total,
    reviews_analyzed = excluded.reviews_analyzed,
    positive_count = excluded.positive_count,
    neutral_count = excluded.neutral_count,
    negative_count = excluded.negative_count,
    avg_sentiment_confidence = excluded.avg_sentiment_confidence,
    authenticity_distribution = excluded.authenticity_distribution,
    details = excluded.details,
    model = excluded.model,
    computed_at = now();

  delete from product_aspects where product_id = p_product_id;
  insert into product_aspects (product_id, aspect_name, mention_count, positive_count, neutral_count, negative_count)
  select p_product_id, a->>'aspect_name', (a->>'mention_count')::int,
         (a->>'positive_count')::int, (a->>'neutral_count')::int, (a->>'negative_count')::int
  from jsonb_array_elements(coalesce(p_aspects, '[]'::jsonb)) as a;
end;
$$;
