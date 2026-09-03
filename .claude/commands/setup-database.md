---
description: Set up the Postgres database via Supabase CLI, apply all migrations, and commit/push each step
---

# Set up the database with Supabase CLI

Do this step by step, in order. Stop and ask the user if any step fails rather than guessing around it — a broken database step should never be silently skipped.

## 1. Check prerequisites

```bash
supabase --version
```

If this fails, install the CLI first (don't proceed without it):

```bash
npm install -g supabase
```

Confirm the user is logged in:

```bash
supabase projects list
```

If this fails with an auth error, run `supabase login` and wait for the user to complete the browser flow before continuing.

## 2. Initialize the Supabase project structure (if not already done)

Check whether a `supabase/` folder already exists at the repo root. If it doesn't:

```bash
supabase init
```

This creates `supabase/config.toml` and `supabase/migrations/`. If `supabase/` already exists, skip this step.

## 3. Link to the real Supabase project

Ask the user for their Supabase project ref (found in their Supabase dashboard URL, `https://supabase.com/dashboard/project/<ref>`) if it isn't already in `.env` as part of `SUPABASE_URL`. Then:

```bash
supabase link --project-ref <project-ref>
```

This will prompt for the database password — let the user enter it interactively, don't try to pass it as a flag in plaintext.

## 4. Move the four schema files into `supabase/migrations/` with proper ordering

Supabase applies migrations in filename order, so each needs a timestamp prefix that sorts correctly. Copy the four existing SQL files into `supabase/migrations/` with these names (adjust the source paths to wherever the files currently live in the repo):

```bash
cp schema.sql supabase/migrations/20260101000001_base_schema.sql
cp screening_api_migration.sql supabase/migrations/20260101000002_screening_api_migration.sql
cp healthcare_transportation_migration.sql supabase/migrations/20260101000003_healthcare_transportation.sql
cp income_and_basic_eligibility_migration.sql supabase/migrations/20260101000004_income_and_basic_eligibility.sql
```

Verify all four are present and in the right order:

```bash
ls supabase/migrations/
```

**Commit this step now, before applying anything:**

```bash
git add supabase/
git commit -m "chore: add Supabase migrations for base schema, screening API, healthcare/transportation, and eligibility filters"
git push
```

## 5. Apply the migrations to the linked project

```bash
supabase db push
```

Watch the output carefully — it applies migrations in order and will stop on the first error. If a migration fails partway through (e.g. the screening API migration failing because the base schema didn't fully apply), fix the specific SQL issue before re-running rather than skipping ahead.

## 6. Verify the schema landed correctly

```bash
supabase db diff --linked
```

This should report no differences if everything applied cleanly. Also spot-check table count:

```bash
supabase db execute --linked "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

Expect 28 tables (18 base + 4 from the screening API migration + 2 healthcare/transportation + 4 income/basic-eligibility).

## 7. Set up environment variables

Ask the user for their Supabase project URL and service role key (both available in the Supabase dashboard under Project Settings → API). Add them to `.env` (never commit this file) and confirm `.env.example` has the placeholder entries:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Check `.gitignore` includes `.env` before proceeding — if it doesn't, add it and commit that fix by itself first, since a real key must never reach a commit.

**Commit the `.env.example` update:**

```bash
git add .env.example
git commit -m "chore: document required Supabase environment variables"
git push
```

## 8. Confirm the app can actually connect

Run whatever local dev/test command exists in this repo (check `package.json` scripts) that exercises `supabase-client.ts` — e.g. a quick script that calls `getSupabase()` and runs a trivial query against `benefit_programs`. Report the result to the user before considering setup complete.

## 9. Final summary commit

If any other setup-related file changes were made along the way (README updates, config tweaks) that haven't been committed yet, commit them now with a clear message, then push:

```bash
git add -A
git commit -m "chore: finish Supabase database setup"
git push
```

Don't create one giant commit at the end covering everything — the point of committing after each numbered step above is that a teammate reviewing history can see exactly which step introduced which change, and a failed step can be reverted independently.
