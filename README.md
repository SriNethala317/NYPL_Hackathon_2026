# NYPL Hackathon 2026

## Repository layout

- `src/` contains the Expo frontend.
- `backend/` contains NYC benefits discovery, deterministic eligibility
  validation, form-payload handoff, the backend HTTP API, and backend tests.
- `src/features/documents/` contains IDNYC PDF automation built with `pdf-lib`.
- `Forms/IDNYCForm.pdf` is the IDNYC AcroForm template used by the automation
  module.

## Frontend

Install the root dependencies and start Expo:

```bash
npm install
npx expo start
```

Use `npm run lint` to run the Expo lint check.

## Backend

The backend domain logic and HTTP API are isolated under `backend/`.

```bash
cd backend
npm install
npm run dev
```

Useful backend checks:

```bash
npm run typecheck
npm run build
npm test
npm run test:mock
npm run test:http
```

See `backend/FRONTEND_API_SPEC.md` for the frontend HTTP contract and
`backend/FORM_AUTOMATION_INTEGRATION.md` for the form-automation handoff.

## IDNYC PDF automation

`src/features/documents/fill-idnyc-form.ts` exports `fillIdNycForm`, which
fills the IDNYC PDF template from the automation branch's `Profile` contract
and returns filled PDF bytes. It currently remains separate from the backend
`FormFillPayload` contract; the adapter between those contracts is future
integration work.
