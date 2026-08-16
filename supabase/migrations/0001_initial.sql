-- Enroll NYC — initial schema.
--
-- Run with:  supabase db push       (or paste into the SQL editor)
--
-- Two principles decide the shape of everything below.
--
-- 1. WE DO NOT STORE DOCUMENTS. There is no bucket and no bytes column. A document is read, the
--    fields it yields are kept, and the original is discarded. This follows IDNYC, which has held
--    no underlying identity or residency documents since 2016 — a breach here exposes a name and
--    an income band, not somebody's passport and visa status.
--
-- 2. EVERY TABLE IS DENY-BY-DEFAULT. RLS is enabled before any policy exists, and every policy is
--    scoped to auth.uid(). The catalogue is the sole exception: it is public data, and it is
--    readable by anyone and writable by no one.

-- ---------------------------------------------------------------------------
-- Public catalogue. Mirrors src/data/programs.runtime.json so screening can run
-- server-side later without the app shipping the whole thing in its bundle.
-- ---------------------------------------------------------------------------

create table if not exists public.programs (
  id              text primary key,            -- unique_id_number from NYC Open Data
  program_code    text,                        -- NOT unique: 43 of 97 rows are literally "N/A"
  name            text not null,
  acronym         text,
  category        text,
  agency          text,
  summary         text,
  eligibility_text text,                       -- the City's own wording, verbatim
  required_documents_text text,
  apply_url       text,
  source_url      text not null,
  fetched_at      timestamptz not null default now()
);

comment on table public.programs is
  'NYC benefits catalogue, ingested from Open Data dataset kvhd-5fmu. Public data.';

create table if not exists public.program_criteria (
  program_id      text primary key references public.programs(id) on delete cascade,
  scorable        boolean not null default false,
  -- True when our reading is a fragment of the real rule. The engine must never issue a negative
  -- on a fragment; see src/data/eligibility.ts.
  partial         boolean not null default false,
  unchecked       text[] not null default '{}',
  criteria        jsonb  not null default '{}'::jsonb,
  -- The City's own sentence behind each rule, so a negative can be shown with its source.
  sources         jsonb  not null default '{}'::jsonb,
  renewal         jsonb
);

alter table public.programs enable row level security;
alter table public.program_criteria enable row level security;

drop policy if exists "catalogue is world readable" on public.programs;
create policy "catalogue is world readable" on public.programs for select using (true);

drop policy if exists "criteria are world readable" on public.program_criteria;
create policy "criteria are world readable" on public.program_criteria for select using (true);

-- No insert/update/delete policies: the catalogue is written by the ingestion script using the
-- service role, never by a client.

-- ---------------------------------------------------------------------------
-- Per-user data. Everything below is private to one authenticated user.
-- ---------------------------------------------------------------------------

-- A document that was read. Deliberately no storage_path, no bytes, no thumbnail.
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null,               -- DocumentTypeId, e.g. 'passport'
  status          text not null,               -- uploading | reading | read | needsType | failed
  confidence      real,
  -- Lets a re-upload of the same file be recognised without keeping the file.
  content_hash    text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- The fields a document yielded. This is the entire retained record of a document.
create table if not exists public.profile_fields (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  key             text not null,               -- fullName | dob | address | household | income
  value           text not null,
  source_document_id uuid references public.documents(id) on delete set null,
  confidence      real,
  -- Null until the user has actually looked at it. An extracted value the user never saw must not
  -- be certified as true on a government form.
  confirmed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (user_id, key)
);

-- Where two equally authoritative documents disagree on a field that should not drift.
create table if not exists public.field_conflicts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  key             text not null,
  candidate_value text not null,
  source_document_id uuid references public.documents(id) on delete cascade,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  program_id      text not null references public.programs(id),
  reference       text not null,               -- server-issued; never a client counter
  stage           smallint not null default 0, -- 0 submitted, 1 in review, 2 decision
  submitted_at    timestamptz not null default now(),
  renewal_due_at  date
);

-- Adapts Local Law 245's disclosure-reporting duty: every read of identifying information is
-- recorded, which is also what makes a breach investigation tractable.
create table if not exists public.audit_log (
  id              bigserial primary key,
  user_id         uuid references auth.users(id) on delete set null,
  actor           text not null,               -- 'user' | 'system' | 'edge-function'
  action          text not null,               -- 'read' | 'write' | 'delete' | 'disclose'
  field_key       text,
  at              timestamptz not null default now()
);

alter table public.documents       enable row level security;
alter table public.profile_fields  enable row level security;
alter table public.field_conflicts enable row level security;
alter table public.applications    enable row level security;
alter table public.audit_log       enable row level security;

-- One policy shape, applied to each private table: you may touch your own rows and no others.
do $$
declare t text;
begin
  foreach t in array array['documents','profile_fields','field_conflicts','applications']
  loop
    execute format('drop policy if exists "owner reads" on public.%I', t);
    execute format('create policy "owner reads" on public.%I for select using (auth.uid() = user_id)', t);

    execute format('drop policy if exists "owner writes" on public.%I', t);
    execute format('create policy "owner writes" on public.%I for insert with check (auth.uid() = user_id)', t);

    execute format('drop policy if exists "owner updates" on public.%I', t);
    execute format('create policy "owner updates" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);

    execute format('drop policy if exists "owner deletes" on public.%I', t);
    execute format('create policy "owner deletes" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- The audit log is readable by its subject but never editable by them: a record somebody can
-- rewrite is not a record.
drop policy if exists "owner reads own audit" on public.audit_log;
create policy "owner reads own audit" on public.audit_log for select using (auth.uid() = user_id);

create index if not exists documents_user_idx      on public.documents(user_id);
create index if not exists profile_fields_user_idx on public.profile_fields(user_id);
create index if not exists applications_user_idx   on public.applications(user_id);
create index if not exists applications_renewal_idx on public.applications(renewal_due_at)
  where renewal_due_at is not null;

-- ---------------------------------------------------------------------------
-- Delete everything, for real.
--
-- Backs the button on the privacy screen. Runs as the calling user, so RLS still applies and it
-- can only ever erase the caller's own rows.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_data()
returns void
language sql
security invoker
as $$
  delete from public.field_conflicts where user_id = auth.uid();
  delete from public.profile_fields  where user_id = auth.uid();
  delete from public.applications    where user_id = auth.uid();
  delete from public.documents       where user_id = auth.uid();
$$;
