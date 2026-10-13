-- ============================================================
-- InvoiceFlow SaaS — Supabase Schema
-- Run this entire file in Supabase SQL Editor (Dashboard → SQL)
-- ============================================================

-- 1. Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  company_name text default 'My Company',
  phone text,
  address text,
  tax_id text,
  website text,
  logo_url text,
  brand_color text default '#2563eb',
  currency_symbol text default '$',
  invoice_prefix text default 'INV-',
  next_invoice_number integer default 1001,
  default_tax_rate numeric(5,2) default 0,
  default_terms text default 'Payment is due within 14 days of invoice date.',
  default_notes text default 'Thank you for your business!',
  template text default 'modern',
  -- Billing (Paddle)
  paddle_customer_id text,
  paddle_subscription_id text,
  subscription_status text default 'trialing', -- trialing | active | past_due | canceled | paused | free | expired
  subscription_plan text default 'free',      -- free | starter | pro | business
  trial_ends_at timestamptz default (now() + interval '7 days'),
  subscription_ends_at timestamptz,           -- when paid period ends (Paddle webhook should set this)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  address text,
  tax_id text,
  notes text,
  created_at timestamptz default now()
);

-- 3. Products / Services
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  sku text,
  price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) default 0,
  unit text default 'item',
  created_at timestamptz default now()
);

-- 4. Invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  number text not null,
  issue_date date not null default current_date,
  due_date date not null,
  status text not null default 'draft', -- draft | sent | viewed | partially_paid | paid | overdue | cancelled
  items jsonb not null default '[]',    -- [{name, description, qty, price, tax_rate, product_id}]
  discount numeric(12,2) default 0,
  discount_type text default 'fixed',   -- fixed | percent
  tax_rate numeric(5,2) default 0,
  shipping numeric(12,2) default 0,
  notes text,
  terms text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  method text,
  reference text,
  payment_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_customers_user on public.customers(user_id);
create index idx_products_user on public.products(user_id);
create index idx_invoices_user on public.invoices(user_id);
create index idx_invoices_customer on public.invoices(customer_id);
create index idx_payments_invoice on public.payments(invoice_id);
create index idx_payments_user on public.payments(user_id);

-- ============================================================
-- Row Level Security (RLS) — Multi-tenant isolation
-- ============================================================
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

-- Profiles
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Customers
create policy "Users manage own customers"
  on public.customers for all using (auth.uid() = user_id);

-- Products
create policy "Users manage own products"
  on public.products for all using (auth.uid() = user_id);

-- Invoices
create policy "Users manage own invoices"
  on public.invoices for all using (auth.uid() = user_id);

-- Payments
create policy "Users manage own payments"
  on public.payments for all using (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Storage bucket for logos (run after enabling Storage)
-- ============================================================
-- In Supabase Dashboard → Storage → create bucket "logos" (public)
-- Then run:
-- insert into storage.buckets (id, name, public) values ('logos', 'logos', true);
-- 
-- Policy (Storage → logos → Policies):
-- CREATE POLICY "Users can upload own logo"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);
--
-- CREATE POLICY "Public read logos"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'logos');
