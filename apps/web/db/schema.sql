-- Deal Match — Postgres schema
-- Run against your Neon DB (provisioned via Vercel Marketplace).

create extension if not exists "pgcrypto";

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  identity_hash text not null unique,
  canonical_title text,
  brand text,
  upc text,
  created_at timestamptz not null default now()
);

create table if not exists price_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  retailer text not null,
  url text not null,
  price numeric(12, 2) not null,
  currency text not null,
  in_stock boolean,
  observed_at timestamptz not null default now()
);

create index if not exists price_observations_product_idx
  on price_observations (product_id, observed_at desc);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  verdict_json jsonb not null,
  generated_at timestamptz not null default now()
);

create index if not exists analyses_product_idx
  on analyses (product_id, generated_at desc);
