-- Enroll NYC — initial schema.
--
-- Run with:  supabase db push       (or paste into the SQL editor)
--
-- Three principles decide the shape of everything below.
--
-- 1. WE DO NOT STORE DOCUMENTS. There is no bucket and no bytes column. A document is read, the
--    fields it yields are kept, and the original is discarded. This follows IDNYC, which has held
--    no underlying identity or residency documents since 2016.
--
--    Be precise about what that leaves, though: name, date of birth, full street address, income
--    and household size. That is not "a name and an income band" — it is the exact triad used for
--    knowledge-based identity verification, already structured and queryable. Discarding the
--    originals is a real and large reduction in harm; it is not the same as the data being benign.
--
-- 2. EVERY TABLE IS DENY-BY-DEFAULT. RLS is enabled before any policy exists, and every policy is
--    scoped to auth.uid(). The catalogue and the reference tables are the sole exceptions: public
--    data, readable by anyone and writable by no client.
--
-- 3. THE FIVE PROFILE FIELDS ARE A CLOSED ENUM. `profile_field_key` has no 'ssn' value and no
--    'sevisId' value, so no column of that type can hold one. The promise that this app never
--    persists a Social Security number stops depending on `field-matchers.ts` continuing to have
--    no label for it, and becomes something Postgres refuses.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Closed vocabularies.
--
-- Values match the TypeScript string literals verbatim, casing included, so there is no
-- translation layer between client and column to get out of step.
-- ---------------------------------------------------------------------------

create type public.document_type_id as enum (
  'passport','state_id','drivers_license','idnyc','permanent_resident_card',
  'i20','w2','pay_stub','tax_return','bank_statement','benefits_letter',
  'lease','utility_bill','unknown'
);

create type public.document_status as enum ('uploading','reading','read','needsType','failed');

create type public.document_failure_reason as enum ('unreadable','timeout','noFields');

-- The load-bearing one. See principle 3 above.
create type public.profile_field_key as enum ('fullName','dob','address','household','income');

-- ---------------------------------------------------------------------------
-- Public catalogue. Mirrors src/data/programs.runtime.json.
-- ---------------------------------------------------------------------------

create table public.programs (
  id                      text primary key,   -- unique_id_number from NYC Open Data
  program_code            text,               -- NOT unique: 43 of 97 rows are literally "N/A"
  name                    text not null,
  acronym                 text,
  plain_language_name     text,
  category                text,
  agency                  text,
  population_served       text[] not null default '{}',
  summary                 text,
  eligibility_text        text,               -- the City's own wording, verbatim
  required_documents_text text,
  apply_url               text,
  source_url              text not null,
  fetched_at              timestamptz not null default now()
);

comment on table public.programs is
  'NYC benefits catalogue, ingested from Open Data dataset kvhd-5fmu. Public data.';

create table public.program_criteria (
  program_id text primary key references public.programs(id) on delete cascade,
  scorable   boolean not null default false,
  -- Why a programme is not scorable, which decides whether the engine may say "probably not" or
  -- must say "we cannot tell". Dropping this collapses those two into one wrong answer.
  method     text not null default 'unmatched' check (method in ('heuristic','llm','unmatched')),
  -- True when our reading is a fragment of the real rule. The engine must never issue a negative
  -- on a fragment; see src/data/eligibility.ts.
  partial    boolean not null default false,
  unchecked  text[] not null default '{}',
  criteria   jsonb  not null default '{}'::jsonb,
  sources    jsonb  not null default '{}'::jsonb,
  renewal    jsonb
);

comment on column public.program_criteria.criteria is
  'ProgramCriteria shape from src/data/eligibility.ts. Kept as jsonb because the shape is derived from prose by a script and genuinely varies per programme; normalising it into columns would fight that.';

-- ---------------------------------------------------------------------------
-- Per-user private data.
-- ---------------------------------------------------------------------------

-- A document that was read. No storage_path, no bytes, no thumbnail. If a future contributor
-- wants to keep the image, they have to add a column and explain why in review.
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           document_type_id not null default 'unknown',
  status         document_status not null default 'uploading',
  confidence     real check (confidence is null or confidence between 0 and 1),
  failure_reason document_failure_reason,
  content_hash   text,
  read_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Re-uploading the same photo should not re-run extraction. Failed reads are excluded so a bad
-- photo can always be retried.
create unique index documents_user_content_hash_uidx
  on public.documents (user_id, content_hash)
  where content_hash is not null and status <> 'failed';

/*
 * Ground truth: one row per (document, field) the extractor reported. Append-only.
 *
 * This table is the fix for the bug that made the first draft of this schema unusable. That draft
 * stored one row per (user, field) with a unique constraint, and the client upserted onto it — so
 * the second document that yielded a field silently overwrote the first. Two documents could never
 * disagree in the database, which meant the entire reconciliation and conflict-resolution system
 * in `reconcile.ts` was unreachable the moment data round-tripped through Supabase.
 *
 * `document_type_id` is denormalised onto every row on purpose. It is a permanent record of "this
 * document, believed at the time to be a passport, said Maria Gonzalez" — reclassifying the
 * document later must not retroactively change what a past reading meant. It also means the client
 * can reconcile without a join, which matters because the second bug in that draft was exactly
 * this: the reload path could not recover the document type, defaulted it to 'unknown', and
 * `authorityRank()` returns Infinity for 'unknown' — so every reloaded candidate was filtered out
 * and a profile loaded from the server reconciled to nothing at all.
 */
create table public.field_candidates (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  document_id      uuid not null references public.documents(id) on delete cascade,
  field_key        profile_field_key not null,
  document_type_id document_type_id not null,
  value            text not null,
  confidence       real not null check (confidence between 0 and 1),
  read_at          timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index field_candidates_user_field_idx on public.field_candidates (user_id, field_key);
create index field_candidates_document_idx   on public.field_candidates (document_id);

/*
 * Deliberately absent: a `profile_fields` table holding the reconciled winner.
 *
 * Storing the resolved value would mean either trusting a client's claim about what the rules
 * produced, or reimplementing `resolveField`/`better`/`normalize` in plpgsql. The first is a hole
 * — a client could assert any value as already-reconciled. The second is worse in a different way:
 * two implementations of the most safety-critical logic in the app, in two languages, drifting
 * apart silently, with a wrong government form as the failure mode.
 *
 * Not storing it removes the choice. Candidates are facts, reconciliation is a pure function over
 * them, and there is exactly one implementation of it. Conflicts are likewise derived rather than
 * stored, so a resolved conflict cannot linger as a stale row.
 */

-- The user's own decisions: a value they typed, or which conflicting candidate they picked.
-- Legitimately user-authored, so full owner CRUD is correct here.
create table public.profile_field_state (
  user_id               uuid not null references auth.users(id) on delete cascade,
  field_key             profile_field_key not null,
  override_value        text,
  resolved_candidate_id uuid references public.field_candidates(id) on delete set null,
  confirmed_at          timestamptz,
  updated_at            timestamptz not null default now(),
  primary key (user_id, field_key)
);

create table public.applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  program_id     text not null references public.programs(id),
  reference      text not null,
  stage          smallint not null default 0 check (stage between 0 and 2),
  -- What the engine told the user at the moment they applied. Immutable audit, never a cache of
  -- live eligibility: screening is a pure function and recomputing it is always correct, whereas a
  -- stored verdict goes stale on the next document upload and someone acts on the stale one.
  screened_status text check (screened_status in
    ('potentially_eligible','needs_more_information','likely_not_eligible','not_screened')),
  submitted_at   timestamptz not null default now(),
  renewal_due_at date,
  updated_at     timestamptz not null default now()
);

create index applications_user_idx    on public.applications (user_id);
create index applications_renewal_idx on public.applications (renewal_due_at)
  where renewal_due_at is not null;

-- That a form was generated, without the form. Counts only — the values that went into it already
-- live in field_candidates, and repeating them here would be a second place for the same data to
-- leak from.
create table public.generated_forms (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  program_id    text not null references public.programs(id),
  form_name     text not null,
  filled_count  int not null default 0,
  manual_count  int not null default 0,
  missing_count int not null default 0,
  generated_at  timestamptz not null default now()
);

create index generated_forms_user_idx on public.generated_forms (user_id);

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

alter table public.programs             enable row level security;
alter table public.program_criteria     enable row level security;
alter table public.documents            enable row level security;
alter table public.field_candidates     enable row level security;
alter table public.profile_field_state  enable row level security;
alter table public.applications         enable row level security;
alter table public.generated_forms      enable row level security;

create policy "catalogue is world readable" on public.programs         for select using (true);
create policy "criteria are world readable" on public.program_criteria for select using (true);
-- No insert/update/delete policy on either: written by scripts/push-catalogue.mjs under the
-- service role, never by a client.

do $$
declare t text;
begin
  foreach t in array array[
    'documents','field_candidates','profile_field_state','applications','generated_forms'
  ]
  loop
    execute format('create policy "owner reads" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "owner writes" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "owner updates" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "owner deletes" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Erasing everything, for real.
--
-- `security invoker` so RLS still applies and this can only ever reach the caller's own rows. With
-- no session auth.uid() is null, `user_id = null` is never true, and it is a safe no-op rather
-- than a bulk delete.
--
-- The client must call this AND sign out. Deleting the app is not enough on its own: the session
-- token lives in the iOS Keychain, which survives app deletion, so a reinstall would otherwise
-- reattach to the same account and the same data.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_data()
returns void language sql security invoker as $$
  delete from public.profile_field_state where user_id = auth.uid();
  delete from public.generated_forms     where user_id = auth.uid();
  delete from public.applications        where user_id = auth.uid();
  delete from public.field_candidates    where user_id = auth.uid();
  delete from public.documents           where user_id = auth.uid();
$$;
