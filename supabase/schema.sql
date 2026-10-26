-- =====================================================================
-- ReviewLens Supabase Database Schema & RLS Security Policies
-- Paste and run this script in Supabase Dashboard -> SQL Editor
-- =====================================================================

-- 1. Create Profiles Table (Synced with Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  display_name TEXT,
  shortlist_ids TEXT[] DEFAULT '{}'::TEXT[],
  compare_ids TEXT[] DEFAULT '{}'::TEXT[],
  muted_categories TEXT[] DEFAULT '{}'::TEXT[],
  strict_trust_mode BOOLEAN DEFAULT FALSE,
  favorite_timestamps JSONB DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read & update their own profile
CREATE POLICY "Allow users to read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Allow users to update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Allow users to insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger to automatically create profile on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Create Fallback Local App Users Table
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  shortlist_ids TEXT[] DEFAULT '{}'::TEXT[],
  compare_ids TEXT[] DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Custom Catalog Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  verification_level TEXT DEFAULT 'link_only',
  product_name TEXT NOT NULL,
  brand TEXT,
  manufacturer TEXT,
  model TEXT,
  category TEXT DEFAULT 'Electronics',
  device_type TEXT DEFAULT 'Electronics',
  description TEXT,
  image_url TEXT,
  price NUMERIC,
  mrp NUMERIC,
  discount_percent INTEGER,
  currency TEXT DEFAULT 'INR',
  rating NUMERIC,
  review_count INTEGER DEFAULT 0,
  availability TEXT DEFAULT 'Check Storefront',
  specs JSONB DEFAULT '{}'::JSONB,
  source_url TEXT NOT NULL,
  canonical_url TEXT,
  url_verified BOOLEAN DEFAULT FALSE,
  url_verification_status TEXT DEFAULT 'not_checked',
  identity_verified BOOLEAN DEFAULT FALSE,
  retrieval_status TEXT DEFAULT 'live',
  data_source_type TEXT DEFAULT 'live_retrieval',
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_source_external UNIQUE (source, external_id)
);

-- Enable Public Read Access to Products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to products" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert access to products" ON public.products
  FOR INSERT WITH CHECK (true);
