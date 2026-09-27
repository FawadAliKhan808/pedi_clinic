# dev-only

Files kept for development that the app doesn't need to run.

- `CLAUDE_CODE_BRIEF.md`: the product brief
- `docs/BACKEND_CONTRACT.md`: the API layer contract
- `docs/MANUAL_TEST_CHECKLIST.md`: on-device checks
- `docs/WHITE_LABEL.md`: how white-label demos work, and adding one
- `docs/Pedi_Clinic_App_Features_for_Design.pdf`: every screen and feature, for
  redesigning with AI design tools (Stitch, Figma Make); edit
  `docs/APP_FEATURES_FOR_DESIGN.html` and re-print it to PDF
- `scripts/`: smoke tests, the concurrency test, and the data reset

Run them from the repo root (they use the root `node_modules` and `.env.local`):

    node --env-file=.env.local dev-only/scripts/smoke-test-queue.mjs
    node --env-file=.env.local dev-only/scripts/test-concurrency.mjs
    node --env-file=.env.local dev-only/scripts/reset.mjs          # dry run
    node --env-file=.env.local dev-only/scripts/reset.mjs --yes    # clears clinic data

The tests run against the live Supabase project and clean up after themselves.
