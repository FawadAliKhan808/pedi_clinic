# Backend contract

Every method in `src/lib/api/` a page or component is allowed to call.
Pages never import a Supabase (or any backend SDK) client directly — only
these interfaces, via `getBrowserApi()` (Client Components) or
`getServerApi()` (Server Components / Route Handlers / Server Actions).

All methods throw `ApiError` (`src/lib/api/types.ts`) on failure. Branch on
`error.code`, never on `error.message` (message text is for logs/debugging
only).

Status: interfaces marked **Implemented** are backed by
`src/lib/api/adapters/supabase/`. Interfaces marked **Not implemented**
exist as a compile-time contract only — calling any method throws
`NOT_IMPLEMENTED` until the build phase that owns them lands (noted per
interface below).

---

## AuthApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `requestPhoneOtp` | `phone: string` (E.164) | `void` | `AUTH_OTP_REQUEST_FAILED` | Public |
| `verifyPhoneOtp` | `phone, code` | `{ userId, isNewUser }` | `AUTH_OTP_VERIFY_FAILED` | Public |
| `signInWithPassword` | `email, password` | `{ userId }` | `AUTH_PASSWORD_SIGNIN_FAILED` | Public |
| `signOut` | — | `void` | `AUTH_SIGNOUT_FAILED` | Any signed-in user |
| `getCurrentUserId` | — | `UUID \| null` | — | Any |
| `getStaffRole` | — | `{ role, clinicId } \| null` | `STAFF_ROLE_LOOKUP_FAILED` | Any signed-in user; reads only the caller's own `staff` row |

Phone OTP uses Supabase phone auth. The demo project's test phone numbers
and their fixed OTP codes are configured in the Supabase dashboard (and
mirrored for reference in `supabase/config.toml` under
`[auth.sms.test_otp]`) — never hardcoded in app code.

`getStaffRole` is the **only** source of truth for role-gating doctor/
pharmacist/owner routes. It is backed by RLS (`staff_select_own`: a user can
only read their own `staff` row), so the result can't be spoofed by client
state. Server-side route/layout guards must call this — never infer role
from email or a client-stored value.

## ParentsApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `ensureProfile` | `{ name? }` | `Parent` | `NOT_AUTHENTICATED`, `MISSING_PHONE`, `PARENT_PROFILE_SAVE_FAILED` | Signed-in parent |
| `getMyProfile` | — | `Parent \| null` | `PARENT_PROFILE_LOOKUP_FAILED` | Signed-in parent |
| `completeProfile` | `{ name }` | `Parent` | same as `ensureProfile` | Signed-in parent |
| `listMyChildren` | — | `Child[]` | `CHILDREN_LIST_FAILED` | Signed-in parent; own children only |
| `addChild` | `{ name, dob }` | `Child` | `PROFILE_INCOMPLETE`, `CHILD_ADD_FAILED` | Signed-in parent; own children only |

`ensureProfile` calls the `upsert_parent_profile` database function, which keys
off the **verified phone number in the caller's JWT**. If the doctor already
created a walk-in record for that number, this is the step that claims it —
linking the existing parent row, its children, and their visit history to the
new account. It's idempotent, so the app calls it right after OTP verification;
`name` may still be null afterwards (that's the first-login name step).

RLS (`parents_select_own` / `parents_insert_own` / `parents_update_own`,
`children_select_own` / `children_insert_own` / `children_update_own`)
scopes every row to `auth.uid()`. `doctor`/`pharmacist` staff additionally
get read access (`parents_select_staff`, `children_select_staff`) for
search and the pharmacy feed — see `QueueApi`/`PharmacyApi` below.

---

## QueueApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `getParentQueueView` | — | `ParentQueueEntry[]` | `PARENT_QUEUE_VIEW_FAILED` | Signed-in parent; own children's tokens only |
| `getDoctorQueue` | `clinicId` | `DoctorQueueEntry[]` | `DOCTOR_QUEUE_FAILED` | Clinic doctor/pharmacist; empty for anyone else |
| `checkIn` | `{ childId, visitReason, appointmentId? }` | `Visit` | `CHILD_NOT_FOUND`, `ACTIVE_TOKEN_EXISTS`, `DAILY_TOKEN_LIMIT_REACHED`, `SETTING_MISSING:*`, `NO_CLINIC_CONFIGURED` | Parent of that child |
| `call` / `recall` | `visitId` | `Visit` | `FORBIDDEN`, `VISIT_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `ACTIVE_CONSULTATION_EXISTS` | Clinic doctor |
| `startConsultation` | `visitId` | `Visit` | `FORBIDDEN`, `INVALID_STATUS_TRANSITION` | Clinic doctor |
| `skip` / `remove` | `visitId` | `Visit` | `FORBIDDEN`, `INVALID_STATUS_TRANSITION` | Clinic doctor |
| `searchChildren` | `clinicId, query` | `ChildSearchResult[]` | `CHILD_SEARCH_FAILED` | Clinic doctor/pharmacist |
| `addWalkIn` | `{ clinicId, name, dob, parentPhone, visitReason }` | `Visit` | `FORBIDDEN`, `INVALID_INPUT`, `ACTIVE_TOKEN_EXISTS` | Clinic doctor |

**Token assignment.** `checkIn` and `addWalkIn` both go through the
`assign_token` database function, which takes a transaction-scoped advisory
lock per clinic-day before reading the next `seq` — so concurrent check-ins
can't be handed the same token. "One active token per child per day" is a
partial unique index, not an application check, so it holds under a true
race. `scripts/test-concurrency.mjs` proves both properties against the live
database.

**Parent position counts.** Parents can't read each other's rows, so
"now serving" and "patients ahead" are computed inside `parent_queue_view`
rather than by reading the queue. "Patients ahead" counts only *waiting*
children with a lower token; skipped and removed tokens are excluded.

**Walk-ins.** `add_walk_in` finds or creates the parent by phone number —
`parents.user_id` is nullable precisely so a record can exist before that
parent has an account — then finds or creates the child by name + date of
birth, then assigns a token, all in one transaction. The record is claimed on
that parent's first OTP login via `ParentsApi.ensureProfile`.

The per-phone daily token limit applies to parent self-service check-in only.
A walk-in entered by the doctor in person deliberately bypasses it: the
safeguard exists to stop remote over-booking, not to block the doctor.

## RealtimeApi — Implemented

| Method | Input | Output |
|---|---|---|
| `subscribeToQueue` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToPharmacyFeed` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToNotifications` | `userId, onChange` | `Unsubscribe` |

Database triggers broadcast to `queue:{clinic_id}`, `pharmacy:{clinic_id}` and `notifications:{user_id}`
on every change. The payloads carry **no personal data** — only which clinic
changed — because parents can't be granted read access to each other's rows;
each side refetches its own read model instead. `onChange` also fires on
(re)subscribe, which is what recovers state after a dropped connection.

## VisitsApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `getVisit` | `visitId` | `Visit` | `VISIT_LOOKUP_FAILED` | Parent of that child, or clinic staff |
| `getVisitSummary` | `visitId` | `VisitSummary \| null` | `VISIT_SUMMARY_FAILED` | Parent of that child, or clinic staff |
| `getChildHistory` | `childId` | `ChildVisitHistoryEntry[]`, newest first | `CHILD_HISTORY_FAILED` | Parent of that child, or clinic staff |
| `completeVisit` | `CompleteVisitInput` | `Visit` | `FORBIDDEN`, `VISIT_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `INVALID_FEE_AMOUNT`, `PAYMENT_TOTAL_MISMATCH` | Clinic doctor |
| `submitRating` | `visitId, stars` (1–5) | `void` | `SUBMIT_RATING_FAILED` | Parent of that child |

`getVisitSummary` is what the parent's post-visit screen reads: fee total,
follow-up date, prescription keys, and their own rating. The pharmacist gets
the same row with `feeTotal` and `ratingStars` nulled out.

**Ratings are owner-only.** A rating is of the *app*, not the doctor, so RLS
lets the parent who left it and the owner team read it — clinic staff never
can. `submitRating` inserts (rather than upserts) because a visit is rated
once and the prompt only appears while `ratingStars` is null.

**Completion is one transaction.** `complete_visit` locks the visit row, then
writes the fee lines, the split payments, the prescription image rows and the
follow-up date together before marking the visit completed — so a visit can
never end up billed but unpaid, or completed with half its photos. Payments are
summed per mode and must equal the fee total to the paisa; the database rejects
the call otherwise, independently of what the billing wizard allows.

The earlier draft of this interface had separate `addPrescriptionImages`,
`setFees`, `recordPayments` and `setFollowUpDate` methods. They were folded into
`completeVisit` precisely because each one on its own is a partial state the
brief's "complete-visit transaction" is meant to rule out.

`getChildHistory` withholds `feeTotal` (returns null) from the pharmacist, who
can see the visit and its prescription photos but never the money.

## StorageApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `uploadPrescriptionImage` | `visitId, file, order` | storage key | `PRESCRIPTION_UPLOAD_FAILED` | Clinic doctor |
| `getSignedUrl` | `storageKey, expiresInSeconds?` (default 300) | URL | `SIGNED_URL_FAILED` | Parent of that child, or clinic staff |
| `removePrescriptionImage` | `storageKey` | `void` | `PRESCRIPTION_DELETE_FAILED` | Clinic doctor |

The `prescriptions` bucket is private; objects are keyed `<visitId>/<file>` and
the storage policies parse that first path segment to decide access, so the
prefix is load-bearing rather than cosmetic. Clients only ever receive
short-lived signed URLs — the objects are not publicly readable.

Photos are compressed client-side before upload (longest edge 1600px, JPEG
q0.8), since clinic phones are on mobile data.

## PharmacyApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `getFeed` | `clinicId` | `PharmacyFeedEntry[]`, oldest first | `PHARMACY_FEED_FAILED` | Clinic doctor/pharmacist |
| `listMedicines` / `searchMedicines` | `clinicId[, query]` | `Medicine[]` | `MEDICINE_LIST_FAILED`, `MEDICINE_SEARCH_FAILED` | Clinic doctor/pharmacist |
| `dispense` | `{ visitId, items[] }` | `PharmacyOrder` | `FORBIDDEN`, `ORDER_NOT_FOUND`, `INVALID_ORDER_STATUS`, `NO_ITEMS`, `MEDICINE_NOT_FOUND`, `INSUFFICIENT_STOCK:<name>` | Clinic **pharmacist** |
| `skipOrder` | `visitId` | `PharmacyOrder` | `FORBIDDEN`, `ORDER_NOT_FOUND`, `INVALID_ORDER_STATUS` | Clinic pharmacist |
| `restock` | `medicineId, quantity` | `Medicine` | `FORBIDDEN`, `MEDICINE_NOT_FOUND`, `INVALID_QUANTITY` | Clinic pharmacist |
| `addMedicine` | `{ clinicId, name, unit, unitPrice, initialStock, lowStockThreshold }` | `Medicine` | `FORBIDDEN`, `INVALID_INPUT` | Clinic pharmacist |

**Dispensing is one transaction.** `dispense_order` walks the requested lines in
medicine-id order — so two concurrent dispenses take locks in the same order and
can't deadlock — locking each medicine row, checking stock, deducting it and
pricing the line from the locked row. Any line that can't be filled aborts the
whole call, so stock cannot go negative and a half-filled order can never be
recorded. This is the fix for the prototype's non-atomic read-then-write.
`scripts/test-concurrency.mjs` proves it: 8 simultaneous dispenses against stock
of 5 yield exactly 5 fills and 3 `INSUFFICIENT_STOCK` refusals.

Prices are copied onto `order_items` at dispensing time, so later price changes
don't rewrite past bills. `restock` increments rather than sets, so two
restocks can't overwrite each other.

An order is created by `complete_visit` in the same transaction that completes
the visit — that's what "appears instantly in the pharmacy feed" means. The feed
is the pending orders; dispensing or skipping clears it.

Dispensing and stock are **pharmacist-only**, including against the doctor —
mirroring the rule that fees are doctor-only. The pharmacist does get the
prescription photos they need to fill the order.

## AppointmentsApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `getBookingWindow` | — | `BookingWindow` | `BOOKING_WINDOW_FAILED`, `NO_CLINIC_CONFIGURED` | Signed-in user |
| `listSessions` | `clinicId, fromDate, toDate` | `AvailabilitySession[]` | `SESSIONS_LIST_FAILED` | Signed-in user (no personal data) |
| `listMyAppointments` | — | `ParentAppointment[]` | `MY_APPOINTMENTS_FAILED` | Signed-in parent; own, upcoming, booked |
| `book` | `{ sessionId, childId }` | `Appointment` | `CHILD_NOT_FOUND`, `SESSION_NOT_FOUND`, `SESSION_CANCELLED`, `SESSION_IN_PAST`, `OUTSIDE_BOOKING_WINDOW`, `SESSION_FULL`, `APPOINTMENT_EXISTS_FOR_DAY` | Parent of that child |
| `reschedule` | `appointmentId, newSessionId` | `Appointment` | as `book`, plus `APPOINTMENT_NOT_FOUND`, `INVALID_APPOINTMENT_STATUS`, `FORBIDDEN` | That child's parent, or clinic doctor |
| `cancel` | `appointmentId` | `Appointment` | `APPOINTMENT_NOT_FOUND`, `INVALID_APPOINTMENT_STATUS`, `FORBIDDEN` | That child's parent, or clinic doctor |
| `listClinicSchedule` | `clinicId, fromDate, toDate` | `ClinicSessionSchedule[]` | `CLINIC_SCHEDULE_FAILED` | Clinic doctor |
| `createSession` | `{ clinicId, date, startTime, endTime, maxBookings }` | `AvailabilitySession` | `FORBIDDEN`, `SESSION_IN_PAST`, `INVALID_SESSION_TIMES`, `SESSION_OVERLAP` | Clinic doctor |
| `updateSessionCapacity` | `sessionId, maxBookings` | `AvailabilitySession` | `CAPACITY_BELOW_BOOKINGS`, `FORBIDDEN` | Clinic doctor |
| `cancelSession` | `sessionId` | bookings affected | `SESSION_NOT_FOUND`, `FORBIDDEN` | Clinic doctor |
| `closeDay` | `clinicId, date` | bookings affected | `FORBIDDEN` | Clinic doctor |
| `copyWeek` | `clinicId, fromWeekStart, toWeekStart` | sessions created | `FORBIDDEN` | Clinic doctor |

**Booking is race-safe.** `book_appointment` locks the session row before
counting its bookings, so concurrent taps can't overbook: 8 simultaneous
bookings for a 3-slot session yield exactly 3 (`scripts/test-concurrency.mjs`).
"One appointment per child per day" is a partial unique index.

**The booking window** is today plus the next `booking_window_days − 1` days, in
the clinic's timezone, from `settings`. Parents are held to it; the doctor
isn't when rescheduling. `max_bookings` is only the appointment share of a
session — everyone else is a walk-in, so there's no separate walk-in setting.

**Who gets told.** Any change the *doctor* makes — reschedule, cancel, cancel a
session, close a day — writes an `appointment_changed` notification for each
affected parent in the same transaction, and the doctor's screen triggers push
delivery immediately. A parent's own changes don't notify them.

**Arrival.** `assign_token` (behind both self check-in and walk-ins) links the
child's booked appointment for today, if any, and marks it `attended`. The
token still takes its normal place: appointments never change queue order.

## Scheduled jobs (pg_cron)

`run_scheduled_jobs()` runs every 5 minutes. For each clinic, each daily job
fires once — the first tick after the clinic-local time set in `settings` — and
catches up if a tick was missed (`scheduled_job_runs` records each run).

| Job | When | What |
|---|---|---|
| Morning run | `reminder_morning_time` | "Appointment today" + follow-up reminders |
| Evening run | `reminder_evening_time` | "Appointment tomorrow" |
| Missed marking | every tick | Past-day bookings with no token → `missed` |

Follow-up reminders go out `follow_up_reminder_days_before` days ahead; a
follow-up set at shorter notice is reminded the next morning. Every reminder is
once-only (partial unique indexes on `notifications`). After a run creates
notifications, the database asks the app to push them via `pg_net` — the URL
and secret live in Supabase Vault, set by `npm run configure:dispatch` once
deployed. Until then reminders wait in the in-app list.

## NotificationsApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `listMine` | — | `AppNotification[]`, newest first | `NOTIFICATIONS_LIST_FAILED` | Signed-in user; own only |
| `markRead` | `notificationIds?` (all when omitted) | `void` | `NOTIFICATIONS_MARK_READ_FAILED` | Signed-in user; own only |
| `registerPushSubscription` | `{ endpoint, keys: { p256dh, auth } }` | `void` | `PUSH_SUBSCRIPTION_FAILED` | Signed-in user |
| `recordInstall` | — | `void` | `RECORD_INSTALL_FAILED` | Signed-in parent (idempotent) |
| `recordNotificationsEnabled` | — | `void` | `RECORD_NOTIFICATIONS_ENABLED_FAILED` | Signed-in parent |
| `getMyInstallStatus` | — | `InstallStatus \| null` | `INSTALL_STATUS_FAILED` | Signed-in parent |
| `dispatchPending` | — | `void` (never throws) | — | Signed-in user |

**Notifications are created by the database, not the app.** A trigger on
`visits` writes "it's your turn" on every transition into `called` — including
Recall, which refreshes `called_at` — and "you're 3rd in line" whenever a
waiting child has exactly two waiting children ahead. A partial unique index
makes the latter once-per-visit however the queue shuffles. Because it's a
trigger, no code path that moves the queue can forget to notify. Walk-in
parents without an account yet have nobody to notify.

Rows carry a **type and data only** (`child_name`, `seq`); every word the parent
sees is rendered by `src/lib/notifications/templates.ts`, shared by push
delivery and the in-app list. Changing the copy never touches delivery logic.

**Delivery.** `dispatchPending` POSTs to `/api/notifications/dispatch`, which
needs the VAPID private key and so runs in the app server. It claims pending
rows with `claim_pending_pushes` (`FOR UPDATE SKIP LOCKED`, service-role only),
so two dispatches running at once take disjoint batches and nothing is pushed
twice. A 404/410 from the push service deletes that subscription. Queue alerts
older than an hour are never pushed — "it's your turn" hours late is noise —
but stay in the in-app list. The route accepts either a user session (the
browser, right after a queue action) or `Bearer NOTIFICATIONS_DISPATCH_SECRET`
(for the scheduled jobs in Phase 7).

The in-app list is always written, so a parent without notifications turned on
— or whose push never arrived — sees everything the next time they open the app.

`installs` is adoption data: readable by the owner team and the parent
themselves (the browser needs it to swap the install popup for an "open from
your home screen" note), never by clinic staff.

## AnalyticsApi — Not implemented (Phase 8)

| Method | Input | Output | Auth |
|---|---|---|---|
| `getDoctorSummary` | `clinicId, { from, to }` | `DoctorAnalyticsSummary` | Doctor only |
| `getEndOfDaySummary` | `clinicId, date` | `EndOfDaySummary` | Doctor only |
| `getOwnerAdoption` | — | `OwnerAdoptionSummary` | Owner only |
| `getOwnerRatings` | — | `OwnerRatingsSummary` | Owner only |

Doctor analytics never include ratings or install/notification adoption
(owner-only data, per brief Section 5.2/5.4).

---

## Settings

There is no `SettingsApi` — the brief's interface list doesn't include one.
Clinic-scoped config (`public.settings`, keyed `(clinic_id, key)`) is read
internally by whichever domain adapter needs it (e.g. `QueueApi.checkIn`
reading the daily per-phone token limit) rather than exposed as its own
top-level surface.
