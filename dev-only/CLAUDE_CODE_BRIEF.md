# Pedi Clinic — Build Brief for Claude Code (v1, approved)

You are building **Pedi Clinic**, a phone-first, installable web app for a pediatric clinic, from scratch in a **new repository**. This is not a redesign of an old codebase — it's a new project. This build is the **base of the real product**: no hardcoded data anywhere; everything comes from the database or a settings table.

Read this entire file before writing any code. Work phase by phase (Section 9). Before each phase, post a short plan and any assumptions, then wait for confirmation before implementing, unless told to proceed through all phases.

**Deadline:** working, demo-ready build by **Thursday 24 Sep 2026**.

---

## 1. Product summary

Parents check their child into a pediatric clinic from their phone, follow a live queue, get notified when it's their turn, and can pre-book appointments. The doctor runs the day from their phone: calls patients, photographs the handwritten prescription, records fees and split payments. The in-house pharmacy gets the visit instantly and dispenses medicines, deducting stock automatically. Everyone — parent, doctor, pharmacist — uses this on a phone. First customer: one pediatrician, ~20 patients/day, with an in-house pharmacy.

## 2. Roles

| Role | Login | Route area |
|---|---|---|
| **Parent** | Phone number + 6-digit SMS OTP | `/` |
| **Doctor** | Email + password | `/admin` → doctor terminal |
| **Pharmacist** | Email + password | `/admin` → pharmacy console |
| **Owner** (our team, not clinic staff) | Email + password, separate route | `/owner` (or similar) |

Roles and clinic membership are stored in a database table and checked **server-side**. Never infer role from an email address or client-side state. Doctor and pharmacist must not be able to reach the Owner dashboard, and vice versa.

## 3. Stack & architecture

- **Frontend:** Next.js (App Router), TypeScript, Tailwind. Installable PWA (manifest, service worker, `display: standalone`).
- **Hosting:** Vercel, default `vercel.app` domain for now.
- **Backend:** a **new Supabase project, Mumbai region** — Postgres, Auth (phone OTP + email/password), Storage, Realtime, scheduled jobs (`pg_cron` or Edge Functions on a schedule).
- **One repository.** App code plus a `supabase/` folder for migrations, RLS policies, and seed/reset scripts.
- **Backend-portability rule:** no page or component may import the Supabase client directly. All data access goes through a typed API layer in `src/lib/api/` (interfaces: `AuthApi`, `ParentsApi`, `QueueApi`, `VisitsApi`, `PharmacyApi`, `AppointmentsApi`, `NotificationsApi`, `AnalyticsApi`, `StorageApi`, `RealtimeApi`) with one implementation, `src/lib/api/adapters/supabase/`. This makes a future move to another backend (e.g. AWS) a matter of writing a second adapter, not rewriting the app.
- **Race-sensitive logic must live in the database**, as plain PostgreSQL functions (portable, not Supabase-only features beyond an isolated `auth.uid()` wrapper): assigning a token number, completing a visit, dispensing a pharmacy order, booking/cancelling an appointment slot. Each must be transactional and safe under concurrent calls. Write a short SQL test or script demonstrating no duplicate tokens and no oversold stock under concurrent execution.
- **No hardcoded data.** Clinic details, timezone, visit reasons, payment modes, booking window length, reminder timing, per-phone daily limits, and similar values live in a `settings` table (or clinic-scoped config), not in code. Demo content (clinic, staff, medicines, past visits) comes from a **seed script**; a **reset script** clears it. The UI itself contains no fake numbers or placeholder content.
- **Timezone:** Asia/Kolkata everywhere (server-side), for tokens, "today", and all reminder scheduling.
- **Language & terms:** English only. UI copy always says "parent" and "child", never "patient".

## 4. Data model (starting point — refine in migrations, keep it normalized)

- `clinics`
- `staff(user_id, clinic_id, role: doctor|pharmacist|owner)` — `owner` may be clinic-independent
- `parents(id, user_id, phone, name)`
- `children(id, parent_id, name, dob)`
- `visits` / tokens: `(id, clinic_id, child_id, visit_date [IST date], seq, status: waiting|called|in_consultation|completed|skipped|removed, visit_reason: vaccination|general_checkup, appointment_id?, called_at, completed_at, follow_up_date, created_at)` — unique `(clinic_id, visit_date, seq)`
- `fees(visit_id, consultation, vaccination, other)`
- `payments(visit_id, mode: cash|upi|card, amount)` — one or more rows per visit, must sum to the fee total
- `prescription_images(visit_id, storage_key, order)`
- `ratings(visit_id, stars 1-5)`
- `medicines`, `pharmacy_orders`, `order_items` (kept close to the current prototype's shape; add proper transactional stock deduction)
- `availability_sessions(id, clinic_id, date, start_time, end_time, max_bookings)`
- `appointments(id, session_id, child_id, status: booked|cancelled|missed|attended, created_at)`
- `notifications(id, user_id, type, payload, sent_at, read_at)`
- `installs(parent_id, installed_at)`, and a flag/timestamp for notifications enabled
- `settings(clinic_id, key, value)` — booking window days, reminder times, per-phone daily token limit, etc.

Apply RLS: parents see only their own children/visits/appointments; doctor/pharmacist see their own clinic's operational data; `fees`/`payments`/analytics revenue readable by doctor role only (not pharmacist); `ratings` and `installs` readable by `owner` role only, not doctor/pharmacist. Prescription images: private bucket, short-lived signed URLs.

## 5. Feature spec by role

### 5.1 Parent

**Onboarding & check-in**
- Phone number + 6-digit OTP (Supabase phone auth; demo uses registered **test phone numbers with fixed codes**, configured in the Supabase dashboard, not in code).
- First login: enter parent name.
- Add child: name + **date of birth** (not age). A parent can have multiple children; pick from saved children on later visits.
- Check-in: choose child, choose **visit reason** — **Vaccination** or **General checkup** (required, no free-text complaint field).
- Tap **Get token** → server assigns the next sequential token for today (IST), inside a transaction — no duplicates under concurrent requests.
- Safeguards (no QR gating in this version): one active token per child per day; a per-phone daily token limit (value in `settings`).

**Queue screen**
- Large "your token" + "now serving" + "X patients ahead of you" (counts only waiting children with a lower token number; skipped/removed excluded).
- Live updates via Realtime; must reconnect and refetch after a dropped connection.
- States shown clearly: Waiting → Called → In consultation → Completed, plus Skipped ("You were skipped, please check with reception.") and Removed.

**Visit summary & records**
- After completion: prescription photo(s) (view, pinch-zoom, download, share), total fee paid, follow-up date if set.
- 1–5 star app rating prompt (nothing else asked).
- **Records** tab: past visits per child, newest first, reopen prescriptions.

**Appointments**
- **Book:** pick child → pick a date within the next **7 days** that has open sessions (sessions with `bookings < max_bookings`) → pick session → confirm.
- **My appointments:** upcoming list with **Reschedule** (pick another open session in the 7-day window) and **Cancel**, no cutoff.
- One appointment per child per day.
- On arrival: normal check-in flow creates a token linked to the appointment (`visits.appointment_id`); queue order is unaffected (still first-come-first-served by token).
- Appointments with no linked token by end of day are marked `missed` (scheduled job).

**Install & notifications**
- Install popup: shown in-browser every visit until installed, with iOS (Share → Add to Home Screen) and Android (install button/menu) instructions; special copy if opened inside an in-app browser (tell them to open in Safari/Chrome). "Not now" dismisses for that visit only (small banner persists). Shown again right after getting a token. **Never shown once installed** — installed app reports "installed" once (`installs` table); browser then shows a small "open from your home screen for alerts" note instead.
- Notification permission: asked only inside the installed app via a "Turn on notifications" button; re-asked every app open until granted; once blocked by the OS, switch to on-screen instructions for re-enabling via phone Settings.

### 5.2 Doctor (phone, bottom tabs: Queue · Appointments · Analytics · Availability)

**Queue**
- Live ordered list: token, child name, age (computed from DOB), visit reason, new/returning, appointment badge.
- **Call** → status → called/in_consultation, sends "It's your turn now" to that child's parent.
- Only one active consultation at a time; calling another child while one is open should prompt to complete/cancel the current one first.
- **Skip** → card moves to the end of the list with **Recall** (calls again, re-sends the notification) and **Remove** buttons.
- **Search** past children by name or phone.
- **Add walk-in:** name, DOB, parent phone, visit reason → creates a token; record attaches to that phone number and is claimed automatically if that parent later logs in with the app.

**Child sheet:** full-screen on tap; last visit summary first, then full history (date, reason, fee, prescription photos).

**Complete visit**
1. Prescription photo(s): native camera capture (`<input type="file" accept="image/*" capture="environment">`), up to 3 photos, client-side compression, retake.
2. Billing wizard, one step per screen:
   - Fees: consultation / vaccination / other (any may be 0); running total shown.
   - Payment: **Cash / UPI / Card / Hybrid**; hybrid takes an amount per mode and must sum exactly to the total.
   - Optional follow-up date → creates a reminder notification only (not an appointment).
   - Review → **Complete Visit**.
3. On complete: visit appears instantly in the pharmacy feed; parent's screen switches to Visit Summary; queue advances.

**Availability**
- Pick a date → add one or more sessions (start/end time) → set **max bookings** per session (this is what's left open for appointments; everything else stays available for walk-ins — no separate walk-in setting).
- Helpers: **Copy last week**, **Mark day closed**.

**Appointments tab:** today + upcoming, grouped by session; doctor can reschedule/cancel an appointment or a whole session/day; every affected parent is notified immediately.

**End-of-day summary:** patients seen, cash/UPI/card totals, fee-type split, appointments attended vs missed.

**Analytics (doctor-only; date ranges: today / 7d / 30d / custom):**
patients/day trend; vaccination vs general checkup; new vs returning children; revenue by day/week/month split by fee type and payment mode; average consultation duration; peak check-in hours; skipped/removed rate; walk-ins vs appointments; missed appointments; follow-up return rate. **Do not** show ratings or install/notification adoption here.

### 5.3 Pharmacist (phone, bottom tabs: Feed · Stock) — functionality unchanged from prototype

- Feed of completed visits, live.
- Tap → prescription photo viewer (pinch-zoom, pan).
- Medicine search/quantity picker → **Dispense**: single transactional operation that deducts stock and computes the bill, rejecting if stock is insufficient (fix the prototype's non-atomic, 3-step write).
- **Skip** clears the visit (parent buying elsewhere).
- Stock: add/restock medicines, low-stock warnings.
- Only changes vs. the old prototype: phone-first layout, the atomic dispense transaction, and timestamps needed for analytics.

### 5.4 Owner (team-only)

Separate login/route. Shows: app rating average + distribution; adoption (parents registered, installed, notifications enabled); usage overview (app tokens vs. manually added walk-ins). Not reachable by doctor or pharmacist accounts, and vice versa for their data.

## 6. Notifications

Deliver via **Web Push (VAPID)** to the installed app, and always also write to an **in-app notification list** as a fallback (shown next time the app is opened if push wasn't delivered/available).

| Trigger | Fires when |
|---|---|
| You're 3rd in line | Exactly two waiting children ahead |
| It's your turn now | Doctor taps Call or Recall |
| Follow-up reminder | 2 days before `follow_up_date` (morning run); if set with <2 days notice, next morning |
| Appointment tomorrow | Evening before |
| Appointment today | Morning of |
| Appointment cancelled/changed | Immediately, when doctor cancels/reschedules |

Reminder run times and the "days before" values live in `settings`, not code. Keep notification copy in one place (e.g. a small message-template module) so wording can be changed without touching logic. Build the scheduled jobs (pg_cron or Edge Functions) for the time-based ones (follow-up, appointment reminders, missed-appointment marking).

## 7. Design & UX bar

This must look like a polished, intentional product — not a default/template UI.

- Establish a small design system first (colour tokens, type scale, spacing, radii, shadows, one icon set) and use it consistently.
- Light theme by default (dark follows system). Calm pediatric palette: a primary calm teal/blue with one warm accent colour, generous whitespace, rounded corners, a real self-hosted font (`next/font`, no remote Google Fonts request).
- Phone-first for **every** role: bottom tab navigation, sticky bottom primary action, ≥48px touch targets, full-screen sheets instead of small dialogs/split panes, `env(safe-area-inset-*)` respected, pinch-zoom allowed (no `maximumScale`/`user-scalable=no`).
- The **queue/token screen is the visual centerpiece**: very large token number, clear status colour coding, reassuring copy.
- Design every state: loading skeletons (no blank flashes), empty states with helpful copy, errors with a clear next step, an offline indicator, success confirmations.
- Subtle, fast motion; respect `prefers-reduced-motion`.
- Toasts top-center. Locale `en-IN`, currency `₹`.

## 8. Explicitly out of scope for this build

QR-gated account creation, complaint/symptom dropdown, Google review linking, OCR, AI summaries/notes, vaccination charts, parent notes-to-doctor, regional languages, online payments, in-clinic urgent/priority flag, medicine dropdown log at visit completion, estimated wait time (show "patients ahead" only), clinic status banner, default fee prefill, parent self-removal from queue, AWS backend (build for portability, but do not build the AWS adapter), privacy/consent screen (flag this as a follow-up, don't skip silently).

## 9. Build phases

Plan and confirm before each phase; keep `main` deployable; typecheck/lint/build clean at the end of each phase; test at a 375px viewport (and a real phone where possible).

1. **Foundation** — repo scaffold, Supabase project wiring, design system/tokens, database schema + RLS + `settings`, staff roles, phone OTP + email/password auth, API layer skeleton (no direct Supabase calls from pages).
2. **Queue core** — check-in (reason + child + DOB), server-side token assignment (race-safe), live queue screen, Call/Skip/Recall/Remove, search, add-walk-in.
3. **Doctor visit flow** — child sheet, prescription capture, billing wizard (fees + split payments), follow-up date, complete-visit transaction.
4. **Pharmacy** — feed, viewer, atomic dispense, stock, skip.
5. **Parent completion loop** — visit summary (view/download/share), rating, records.
6. **Install & notifications** — manifest/service worker, install popup logic (incl. installed-detection), notification permission flow, push delivery, in-app notification list, the 3rd-in-line / your-turn triggers.
7. **Appointments** — availability sessions, booking, reschedule/cancel (parent + doctor), session/day cancel, arrival linking, missed-marking job, appointment reminder jobs.
8. **Analytics & Owner dashboard** — doctor analytics, owner-only dashboard, end-of-day summary.
9. **Polish & demo readiness** — seed script (realistic demo data) + reset script, empty/error/offline states pass, full run-through on a real phone: check-in → call → complete visit with split payment → dispense → summary → rating; Lighthouse PWA-installable check; no horizontal scroll at 320–430px.

If time is short before Thursday, defer in this order: analytics charts → prescription share/download → search of past children → appointments (build last as planned, since it's the newest, most isolated feature).

## 10. Working agreements

- Ask when something here is ambiguous — do not silently invent behavior.
- Small, reviewable commits. No secrets committed; `.env.local` + `.env.example`. Keep the GitHub repo private.
- Maintain `README.md` (setup, env vars, seed/reset scripts, deploy steps) and `docs/BACKEND_CONTRACT.md` documenting every `src/lib/api/` method (inputs, outputs, errors, auth rules).
- Don't add scope beyond this brief; if something seems missing, list it under "Suggestions" at the end of a phase instead of building it.

## 11. Open items (not blockers, but not yet decided — flag, don't build silently)

- Exact reminder times of day (placeholder defaults in `settings`, confirm before launch).
- Privacy notice / parental consent screen (not in this build; needed before real data is collected).
- Production SMS provider (India requires DLT registration) — the demo uses Supabase test numbers only.
