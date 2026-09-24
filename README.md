# Pedi Clinic

A phone-first, installable web app for a pediatric clinic. Parents check in
and follow a live queue; the doctor runs the day from their phone; the
in-house pharmacy dispenses against every completed visit.

See [`CLAUDE_CODE_BRIEF.md`](./CLAUDE_CODE_BRIEF.md) for the full product
brief and [`docs/BACKEND_CONTRACT.md`](./docs/BACKEND_CONTRACT.md) for the
API layer's method-by-method contract.

## Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS v4, built as
  an installable PWA.
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime), project region
  `ap-south-1` (Mumbai).
- **Backend portability:** no page or component imports the Supabase client
  directly — everything goes through the typed API layer in `src/lib/api/`,
  implemented today by the single adapter in
  `src/lib/api/adapters/supabase/`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

There is no local Supabase stack in this setup (no Docker on this machine) —
`npm run dev` talks directly to the hosted Mumbai project defined in
`.env.local`. Be mindful that schema/data changes affect that shared project.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values from the
Supabase project's dashboard (Project Settings → API):

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | safe to expose, RLS enforces access |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | **never** expose to the client bundle; bypasses RLS |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | browser + server | Web Push public key; safe to expose |
| `VAPID_PRIVATE_KEY` | server only | Web Push signing key; generate with `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | server only | contact for push services, e.g. `mailto:team@example.com` |
| `NOTIFICATIONS_DISPATCH_SECRET` | server only | lets scheduled jobs trigger push delivery without a session |

## Database

Schema lives in `supabase/migrations/`. `supabase/config.toml` mirrors the
hosted project's actual auth/api/storage settings (pulled via
`supabase config pull`, not hand-edited) — including the demo's phone-OTP
test numbers under `[auth.sms.test_otp]`, which are dashboard-configured,
not hardcoded in app code.

```bash
npm run db:push    # apply pending migrations to the linked hosted project
npm run db:types   # regenerate database.types.ts after a schema change
```

## Scripts

```bash
npm run provision         # clinic + settings (incl. session presets) + doctor/pharmacist/owner logins (idempotent)
npm run test:concurrency  # proves tokens can't duplicate, stock can't oversell, a booking is never stranded
npm run test:queue        # end-to-end: parent check-in → doctor call/skip/recall
npm run test:visit        # end-to-end: complete a visit, and who may see the money
npm run test:pharmacy     # end-to-end: feed → dispense → stock, and role limits
npm run test:notifications # triggers, dedupe, RLS, dispatch (needs the app running on :3200)
npm run test:appointments # open sessions, permanent bookings with a reason, check-in with a booking, scheduled jobs
npm run test:analytics    # role gates, ranges, every analytics number, and patient history
npm run reset             # dry run: shows what a reset would delete
npm run reset -- --yes    # clears all clinic data; keeps the clinic, settings and staff logins
npm run configure:dispatch # after deploying: lets scheduled reminders trigger push (APP_URL=https://…)
```

The test scripts run against the live project. They create only their own data,
delete it afterwards, and restore anything they had to move out of the way — so
they're safe to run while someone else is demoing.

`provision` is the minimum the app needs to run. Default staff logins are
printed when it runs, and can be overridden with `DEMO_*` env vars.

`reset` removes every parent (and their login), child, visit, appointment,
session, medicine, pharmacy order, rating, notification, install record and
prescription photo. It keeps the clinic, its settings and the staff logins, so
the app works straight after. It is irreversible: without `--yes` it only
prints the counts. The database side (`reset_clinic_data`) can be called only
with the service-role key, never by a signed-in user.

A demo-data seed script is deliberately not included yet.

Parents sign in with a phone number — the demo uses the Supabase test numbers
in `supabase/config.toml` under `[auth.sms.test_otp]`, which accept a fixed
code instead of sending a real SMS.

## Project structure

```
src/
  app/                    Routes (App Router), PWA manifest/icons
    admin/(terminal)/     Staff terminal, guarded server-side by staff role
      (doctor)/           Queue, appointments, analytics, availability
      (pharmacist)/       Pharmacy feed and stock
    owner/                Owner (team) dashboard: /owner/login, /owner
  components/
    admin/ parent/ ui/    Role-specific screens and the shared design system
    charts/ analytics/    Chart primitives (plain HTML/CSS) and the analytics views
  fonts/                  Self-hosted variable font (next/font/local)
  lib/api/                Backend-agnostic interfaces (Auth, Parents, Queue, ...)
    adapters/supabase/    The one implementation, today
  proxy.ts                Refreshes the auth session on every navigation
docs/
  BACKEND_CONTRACT.md     Every src/lib/api/ method: inputs, outputs, errors, auth rules
scripts/                  Provisioning and test scripts
supabase/
  migrations/             SQL migrations (source of truth for schema + RLS)
  config.toml             Mirrors the hosted project's auth/api/storage config
```

Race-sensitive logic (token assignment, queue transitions, walk-ins) lives in
PostgreSQL functions, not application code. `visits` has no client-facing
write policy at all — every mutation goes through a `SECURITY DEFINER`
function that checks authorization itself.

## Design system

Colour, radius, shadow, and type tokens live in `src/app/globals.css` as CSS
custom properties mapped into Tailwind's `@theme`. Light theme is default;
dark follows `prefers-color-scheme` automatically. Icon set: `lucide-react`.

**Mobile-first, not mobile-only.** `NavShell` (`src/components/layout/`) gives
bottom tabs on phones, an icon rail on tablets and a full sidebar on laptops.
Sheets are full-screen on phones and a right-hand drawer from tablet width up;
the main action button is pinned to the bottom on phones and sits inline wider
up. Card grids use container queries (`@2xl:`/`@4xl:`) so the column count
follows the space actually available beside the nav.

## Deploy

Vercel, on the default `vercel.app` domain.

1. Import the GitHub repo in Vercel (framework preset: Next.js; no build
   settings to change).
2. Add every variable from the table above under Project → Settings →
   Environment Variables (Production and Preview), copying the values from
   `.env.local`. Keep `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` and
   `NOTIFICATIONS_DISPATCH_SECRET` server-only (no `NEXT_PUBLIC_` prefix).
3. Deploy, then in Supabase → Authentication → URL Configuration set the
   Site URL to the Vercel URL.
4. Point scheduled reminders at the deployment so they can send push:
   `APP_URL=https://<app>.vercel.app npm run configure:dispatch`.
5. Apply any pending migrations with `npm run db:push` (the database is
   shared by every deployment and by `npm run dev`).

Web Push and installing to the home screen need HTTPS, so test those on
the deployed URL, not on `localhost` from a phone. `docs/MANUAL_TEST_CHECKLIST.md`
lists everything to check on real devices.
