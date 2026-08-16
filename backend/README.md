# Benefits backend

This package contains the privacy-safe benefits discovery pipeline, deterministic
eligibility validators, form-payload handoff, provider configuration, and tests.

```bash
cd backend
npm install
npm run typecheck
npm run build
npm test
```

There is no HTTP server in the current codebase. Consumers import the backend
domain APIs directly. Add a transport layer only when the team defines one.
