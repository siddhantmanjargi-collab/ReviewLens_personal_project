-- ReviewLens schema v1
-- Paste into Supabase -> SQL Editor -> Run. (gen_random_uuid() is built into Postgres 13+, so no extension is needed.)
-- Design rules enforced IN THE DATABASE, not just in application code:
--   * only amazon.in products
--   * a product row can only exist if its identity was verified
--   * url_verified can only be true when status = 'verified' and a canonical URL exists
--   * a review's (product_id, asin) must match a real product row -> no cross-product reviews
--   * raw reviews and AI analysis live in separate tables (re-analysis never overwrites raw data)


create table if not exists data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null check (source_type in ('live_retrieval','cached','dataset','authorized_api','manual_import')),
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'amazon.in' check (source = 'amazon.in'),
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  product_name text not null check (length(btrim(product_name)) > 0),
  brand text,
  manufacturer text,
  model text,
  category text,
  device_type text,
  description text,
  image_url text,
  price numeric(12,2) check (price is null or price >= 0),
  mrp numeric(12,2) check (mrp is null or mrp >= 0),
  discount_percent numeric(5,2) check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  currency text not null default 'INR',
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  review_count integer check (review_count is null or review_count >= 0),
  availability text,
  -- category-specific specifications (RAM/Storage for phones, Capacity/Power for appliances, ...)
  specs jsonb not null default '{}'::jsonb check (jsonb_typeof(specs) = 'object'),
  -- core fields the source did not provide. Stored explicitly, never guessed.
  unavailable_fields text[] not null default '{}',
  source_url text,
  canonical_url text,
  url_verified boolean not null default false,
  url_verification_status text not null default 'not_checked'
    check (url_verification_status in ('verified','failed','unavailable','redirected','blocked','not_checked')),
  identity_verified boolean not null default false,
  retrieval_status text not null default 'unavailable'
    check (retrieval_status in ('live','recent','cached','failed','unavailable')),
  data_source_type text not null default 'dataset'
    check (data_source_type in ('live_retrieval','cached','dataset','authorized_api','manual_import')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_identity_required check (identity_verified = true),
  constraint products_url_verified_consistent check (
    url_verified = false
    or (url_verification_status = 'verified' and canonical_url is not null)
  ),
  constraint products_source_asin_unique unique (source, asin),
  -- target for the composite foreign key used by reviews
  constraint products_id_asin_unique unique (id, asin)
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  source text not null default 'amazon.in' check (source = 'amazon.in'),
  source_review_id text,
  content_hash text not null,
  review_title text,
  review_text text not null check (length(btrim(review_text)) > 0),
  rating smallint not null check (rating between 1 and 5),
  review_date date,
  verified_purchase boolean,
  reviewer_name text,
  helpful_votes integer check (helpful_votes is null or helpful_votes >= 0),
  data_source_type text not null default 'dataset'
    check (data_source_type in ('live_retrieval','cached','dataset','authorized_api','manual_import')),
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- A review can only point at a product whose ASIN is the same ASIN stored on the review.
  constraint reviews_product_asin_fk foreign key (product_id, asin)
    references products (id, asin) on delete cascade,
  constraint reviews_unique_content unique (product_id, content_hash)
);
create unique index if not exists reviews_unique_source_id
  on reviews (product_id, source_review_id) where source_review_id is not null;
create index if not exists reviews_product_idx on reviews (product_id);

-- AI output. Never mixed into the raw review row.
create table if not exists review_analysis (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews (id) on delete cascade,
  model text not null,
  prompt_version text not null,
  sentiment text not null check (sentiment in ('positive','neutral','negative')),
  sentiment_confidence numeric(4,3) not null check (sentiment_confidence between 0 and 1),
  authenticity_risk numeric(4,3) not null check (authenticity_risk between 0 and 1),
  authenticity_classification text not null
    check (authenticity_classification in ('low_suspicion','moderate_suspicion','highly_suspicious')),
  aspects jsonb not null default '[]'::jsonb check (jsonb_typeof(aspects) = 'array'),
  reasoning_signals jsonb not null default '[]'::jsonb check (jsonb_typeof(reasoning_signals) = 'array'),
  heuristic_signals jsonb not null default '{}'::jsonb check (jsonb_typeof(heuristic_signals) = 'object'),
  analyzed_at timestamptz not null default now(),
  constraint review_analysis_unique_run unique (review_id, model, prompt_version)
);
create index if not exists review_analysis_review_idx on review_analysis (review_id);

-- Aggregates are derived from review_analysis by the backend, never typed in by hand.
create table if not exists product_aspects (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  aspect_name text not null,
  mention_count integer not null check (mention_count >= 0),
  positive_count integer not null check (positive_count >= 0),
  neutral_count integer not null check (neutral_count >= 0),
  negative_count integer not null check (negative_count >= 0),
  computed_at timestamptz not null default now(),
  constraint product_aspects_counts_consistent check (positive_count + neutral_count + negative_count = mention_count),
  constraint product_aspects_unique unique (product_id, aspect_name)
);

create table if not exists product_analysis (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references products (id) on delete cascade,
  reviews_total integer not null check (reviews_total >= 0),
  reviews_analyzed integer not null check (reviews_analyzed >= 0),
  positive_count integer not null check (positive_count >= 0),
  neutral_count integer not null check (neutral_count >= 0),
  negative_count integer not null check (negative_count >= 0),
  avg_sentiment_confidence numeric(4,3) check (avg_sentiment_confidence is null or avg_sentiment_confidence between 0 and 1),
  authenticity_distribution jsonb not null default '{}'::jsonb,
  model text,
  computed_at timestamptz not null default now(),
  constraint product_analysis_counts_consistent check (positive_count + neutral_count + negative_count = reviews_analyzed),
  constraint product_analysis_analyzed_le_total check (reviews_analyzed <= reviews_total)
);

-- The backend uses the service-role key (bypasses RLS). Enabling RLS with no policies
-- means the public anon key can read/write nothing.
alter table data_sources enable row level security;
alter table products enable row level security;
alter table reviews enable row level security;
alter table review_analysis enable row level security;
alter table product_aspects enable row level security;
alter table product_analysis enable row level security;

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();
