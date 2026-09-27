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
| `updateChild` | `childId, { name, dob }` | `Child` | `CHILD_NOT_FOUND`, `INVALID_INPUT`, `INVALID_DOB` | Parent of that child |
| `deleteChild` | `childId` | `void` | `CHILD_NOT_FOUND`, `CHILD_HAS_VISITS` (a child with any visit keeps their records) | Parent of that child |

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
| `getDoctorQueue` | `clinicId` | `DoctorQueueEntry[]` (includes `parentName`, null until the parent gives one) | `DOCTOR_QUEUE_FAILED` | Clinic doctor/pharmacist; empty for anyone else |
| `checkIn` | `{ childId, visitReason, checkInCode, appointmentId? }` — `checkInCode` from the printed reception QR; with `appointmentId`, the booking's reason is used | `Visit` | `CHECKIN_CODE_INVALID` (missing, not the clinic's, or replaced since), `CHILD_NOT_FOUND`, `ACTIVE_TOKEN_EXISTS`, `APPOINTMENT_NOT_FOUND`, `INVALID_INPUT`, `NO_CLINIC_CONFIGURED` | Parent of that child (and of that booking's child) |
| `getCheckInQrCode` | — | `{ code }` — the clinic's code, for the printable QR | `FORBIDDEN` | Clinic doctor or pharmacist |
| `replaceCheckInCode` | — | `{ code }` — a new code; every old printout stops working | `FORBIDDEN` | Clinic doctor |
| `call` / `recall` | `visitId` | `Visit` | `FORBIDDEN`, `VISIT_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `ACTIVE_CONSULTATION_EXISTS` | Clinic doctor |
| `startConsultation` | `visitId` | `Visit` | `FORBIDDEN`, `INVALID_STATUS_TRANSITION` | Clinic doctor |
| `skip` / `remove` | `visitId` | `Visit` | `FORBIDDEN`, `INVALID_STATUS_TRANSITION` | Clinic doctor |
| `searchChildren` | `clinicId, query` — matches child name, parent name or phone | `ChildSearchResult[]` | `CHILD_SEARCH_FAILED` | Clinic doctor/pharmacist |
| `addWalkIn` | `{ clinicId, name, dob, parentPhone, visitReason }` | `Visit` | `FORBIDDEN`, `INVALID_INPUT`, `INVALID_PHONE` (exactly 10 digits), `INVALID_DOB`, `ACTIVE_TOKEN_EXISTS` | Clinic doctor |

**Dates of birth** can't be in the future: a trigger on `children` refuses
one (`INVALID_DOB`) on insert or update, whatever the path.

**Token assignment.** `checkIn` and `addWalkIn` both go through the
`assign_token` database function, which takes a transaction-scoped advisory
lock per clinic-day before reading the next `seq` — so concurrent check-ins
can't be handed the same token. A child may hold more than one token on the
same day, but **not while one is still in play**: a child who is waiting,
called or with the doctor can't get another token (`ACTIVE_TOKEN_EXISTS`,
checked under the same clinic-day lock, so two simultaneous check-ins yield
exactly one). There is no daily limit per phone number.

**Check-in only inside the clinic.** A parent's `checkIn` must carry the
code from the QR printed for reception (`/admin/check-in-qr`, which also
prints it). The code is an HMAC of a per-clinic secret in `checkin_secrets`,
which no client can read. It stays the same until the doctor replaces it
(`replaceCheckInCode`), which makes every old printout — and any photo of
one — stop working at once. Staff walk-ins (`addWalkIn`) don't need a code.
`scripts/test-concurrency.mjs` proves both against the live database.

**Parent position counts.** Parents can't read each other's rows, so
"now serving" and "patients ahead" are computed inside `parent_queue_view`
rather than by reading the queue. "Patients ahead" counts only *waiting*
children with a lower token; skipped and removed tokens are excluded.

**Walk-ins.** `add_walk_in` finds or creates the parent by phone number —
`parents.user_id` is nullable precisely so a record can exist before that
parent has an account — then finds or creates the child by name + date of
birth, then assigns a token, all in one transaction. The record is claimed on
that parent's first OTP login via `ParentsApi.ensureProfile`.

## RealtimeApi — Implemented

| Method | Input | Output |
|---|---|---|
| `subscribeToQueue` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToPharmacyFeed` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToAppointments` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToNotifications` | `userId, onChange` | `Unsubscribe` |
| `subscribeToOwnerOverview` | `onChange` | `Unsubscribe` |

Database triggers broadcast to `queue:{clinic_id}`, `pharmacy:{clinic_id}`,
`appointments:{clinic_id}` (any session or booking change),
`notifications:{user_id}`, and `owner:overview` (installs, notification
opt-ins, registrations, ratings, tokens — statement-level, no payload) on
every change. The payloads carry **no personal data** — only which clinic
changed — because parents can't be granted read access to each other's rows;
each side refetches its own read model instead. `onChange` also fires on
(re)subscribe and whenever the page becomes visible again, which is what
recovers state after a dropped connection or a sleeping phone. Screens use
`useLiveRefresh(channel, clinicId, refresh)` (`src/lib/realtime/`):

| Screen | Live on |
|---|---|
| Parent home (token cards), Your queue | queue |
| Parent booking, Appointments list, reschedule sheet | appointments |
| Parent notification bell | notifications |
| Doctor queue | queue |
| Doctor Appointments (and its reschedule sheet), Availability | appointments |
| Doctor Alerts and nav badge | notifications |
| Pharmacist feed | pharmacy |
| Owner dashboard (re-renders the server page) | owner overview |
| Parent frame: opens a visit's summary when it's completed | queue |

A booking screen whose selected time is taken meanwhile clears the
selection and says so. `npm run test:appointments` checks that a new session
and a new booking reach a subscribed client.

## VisitsApi — Implemented

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `getVisit` | `visitId` | `Visit` | `VISIT_LOOKUP_FAILED` | Parent of that child, or clinic staff |
| `getVisitSummary` | `visitId` | `VisitSummary \| null` | `VISIT_SUMMARY_FAILED` | Parent of that child, or clinic staff |
| `getChildHistory` | `childId` | `ChildVisitHistoryEntry[]`, newest first | `CHILD_HISTORY_FAILED` | Parent of that child, or clinic staff |
| `completeVisit` | `CompleteVisitInput` | `Visit` | `FORBIDDEN`, `VISIT_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `INVALID_FEE_AMOUNT`, `PAYMENT_TOTAL_MISMATCH` | Clinic doctor |
| `listPatientsOn` | `clinicId, date` | `DayPatient[]` — children whose consultation was **completed** that day, with parent and total consultations | `PATIENTS_ON_DAY_FAILED` | Clinic doctor (empty for anyone else) |
| `searchConsultedChildren` | `clinicId, query` | `ConsultedChild[]` — children with at least one completed consultation, by child name, parent name or phone | `PATIENT_SEARCH_FAILED` | Clinic doctor (empty for anyone else) |
| `getChildTimeline` | `childId` | `VisitTimelineEntry[]`, completed consultations newest first — reason, fees, payments, follow-up, prescription keys, pharmacy order and medicines | `CHILD_TIMELINE_FAILED` | Doctor of the visits' clinic (empty for anyone else) |
| `submitRating` | `visitId, stars` (1–5) | `void` | `ALREADY_RATED`, `VISIT_NOT_FOUND`, `SUBMIT_RATING_FAILED` | Parent of that child |
| `hasRatedApp` | — | `boolean` | `RATING_LOOKUP_FAILED` | Signed-in parent |

`getVisitSummary` is what the parent's post-visit screen reads: fee total,
follow-up date, prescription keys, and their own rating. The pharmacist gets
the same row with `feeTotal` and `ratingStars` nulled out.

**Ratings are owner-only.** A rating is of the *app*, not the doctor, so RLS
lets the parent who left it and the owner team read it — clinic staff never
can. **One rating per parent, ever:** `ratings.parent_id` is unique, parents
have no insert policy, and `submit_app_rating` is the only way in (a second
try raises `ALREADY_RATED`). The visit summary shows the prompt only while
`hasRatedApp()` is false.

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
| `getBookingWindow` | — | `BookingWindow` (with `sessionPresets`) | `BOOKING_WINDOW_FAILED`, `NO_CLINIC_CONFIGURED` | Signed-in user |
| `listSessions` | `clinicId, fromDate, toDate` | `AvailabilitySession[]` | `SESSIONS_LIST_FAILED` | Signed-in user (no personal data) |
| `listMyAppointments` | — | `ParentAppointment[]` (with `visitReason`) | `MY_APPOINTMENTS_FAILED` | Signed-in parent; own, today onwards, booked |
| `book` | `{ sessionId, childId, visitReason }` | `Appointment` (`booked`) | `CHILD_NOT_FOUND`, `INVALID_INPUT`, `APPOINTMENT_EXISTS_FOR_DAY` (one per child per day), `SESSION_NOT_FOUND`, `SESSION_CANCELLED`, `SESSION_IN_PAST`, `OUTSIDE_BOOKING_WINDOW` | Parent of that child |
| `listClinicSchedule` | `clinicId, fromDate, toDate` | `ClinicSessionSchedule[]` — every booking with child, reason, parent | `CLINIC_SCHEDULE_FAILED` | Clinic doctor |
| `createSession` | `{ clinicId, date, startTime, endTime }` | `AvailabilitySession` | `FORBIDDEN`, `SESSION_IN_PAST`, `INVALID_SESSION_TIMES` (end ≤ start), `SESSION_OVERLAP` | Clinic doctor |
| `cancelSession` | `sessionId` | bookings cancelled | `SESSION_NOT_FOUND`, `FORBIDDEN` | Clinic doctor |
| `closeDay` | `clinicId, date` | bookings cancelled | `FORBIDDEN` | Clinic doctor |
| `copyWeek` | `clinicId, fromWeekStart, toWeekStart` | sessions created | `FORBIDDEN` | Clinic doctor |

**Sessions are open blocks of time.** A session is just a date and a time
range (e.g. Evening 18:00–21:00). It has **no capacity and no slots**: any
number of children can book it. The doctor's one-tap buttons come from the
`session_presets` setting (default Morning 10:00–13:00 and Evening
18:00–21:00, returned as `BookingWindow.sessionPresets`); a custom session can
use any times with the end after the start. Sessions on one day can't overlap.

**Parents can't change a booking.** Once made, a parent can't cancel or move
it — the functions that did it are gone, and clients have no write policies
on `appointments`. Only the **doctor** can end bookings early, by cancelling
a session or a whole day: every booking in it becomes `cancelled` and each
parent gets an `appointment_changed` notification in the same transaction —
rendered as **"Your appointment has been cancelled."** in the parent's
notification list, and pushed straight away by the doctor's screen.
Otherwise a booking ends by the child arriving (`attended`) or the day
passing (`missed`).

**Booking is instant, with a reason.** Booking works like joining the queue:
child, reason for visit (`vaccination` / `general_checkup`), then the
session. It is confirmed (`booked`) at once — there is no approval step —
and every doctor of the clinic gets a `booking_request` notification ("New
appointment: …" with the reason). `pending`, `rejected` and `cancelled` only
exist on rows from earlier versions of the flow.

**Race-safe.** `book_appointment` and `cancel_session` both lock the session
row, so cancelling a session while bookings are landing never leaves a live
one: each lands first (and is cancelled with the session, its parent told)
or is refused after it; 8 simultaneous bookings of one session all succeed
(`scripts/test-concurrency.mjs`). A child may have more than one appointment
(and token) on the same day.

**The booking window** is today plus the next `booking_window_days − 1` days, in
the clinic's timezone, from `settings`. A session already over today isn't
listed.

**Arrival.** `assign_token` (behind both self check-in and walk-ins) links the
child's earliest booked appointment for today, if any, and marks it
`attended`. The token still takes its normal place: appointments never change
queue order.

**"Coming for the same reason?"** If a child has a booking on a later day,
check-in asks the parent whether today's visit is for the same reason. On yes,
`checkIn` is called with that `appointmentId`: the server checks the booking
belongs to that child, is `booked` and is today or later
(`APPOINTMENT_NOT_FOUND` otherwise), makes the token with **the booking's
reason**, and marks the booking `attended` — it has been used.

**Missed.** The daily job marks every booking whose date has passed without a
check-in as `missed` (see Scheduled jobs). Analytics report attended vs
missed for bookings due in a range.

## Scheduled jobs (pg_cron)

`run_scheduled_jobs()` runs every 5 minutes. For each clinic, each daily job
fires once — the first tick after the clinic-local time set in `settings` — and
catches up if a tick was missed (`scheduled_job_runs` records each run).

| Job | When | What |
|---|---|---|
| Morning run | `reminder_morning_time` | "Appointment today" + follow-up reminders |
| Evening run | `reminder_evening_time` | "Appointment tomorrow" |
| Missed marking (daily cleanup) | every tick, so just after midnight clinic time | Bookings whose day has passed with no check-in → `missed` |

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
| `delete` | `notificationId` | `void` | `NOTIFICATION_DELETE_FAILED` | Signed-in user; own only (RLS) |
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

`listMine` also returns the referenced appointment's *current* status
(`appointmentStatus`), so the doctor's notification center can show Approve /
Reject only while a request is still pending, and the outcome once decided.

**About the requested `notifications` shape.** The approval spec asked for a
notifications table with `title`, `message`, `reference_id` and `is_read`. The
existing table already covers it: `appointment_id` is the reference, `read_at`
is `is_read` (plus when), and delete is allowed on your own rows. Title and
message are deliberately *not* stored — the brief requires notification wording
to live in one place (`templates.ts`) so it can change without touching data or
logic; they're rendered from the stored type + data instead.

The in-app list is always written, so a parent without notifications turned on
— or whose push never arrived — sees everything the next time they open the app.

`installs` is adoption data: readable by the owner team and the parent
themselves (the browser needs it to swap the install popup for an "open from
your home screen" note), never by clinic staff.

## AnalyticsApi — Implemented

| Method | Input | Output | Auth | Errors |
|---|---|---|---|---|
| `getDoctorAnalytics` | `clinicId, { from, to }` | `DoctorAnalyticsSummary` | Doctor of that clinic | `FORBIDDEN`, `INVALID_RANGE` (reversed, or over 366 days) |
| `getEndOfDaySummary` | `clinicId, date` | `EndOfDaySummary` | Doctor of that clinic | `FORBIDDEN` |
| `getOwnerOverview` | — | `OwnerOverview` | Owner only | `FORBIDDEN` |

Backed by the `SECURITY DEFINER` functions `doctor_analytics`,
`end_of_day_summary` and `owner_overview`, each checking the caller's role
from `staff` first. Execution is revoked from `anon`.

Definitions:

- **Patients** are completed visits. **Revenue** is consultation money
  (`fees` by type, `payments` by mode). **Pharmacy** sales (`daily.pharmacy`,
  `pharmacyOrders`; end of day `pharmacy.total` / `orders`) are dispensed
  order totals, counted on the clinic-local day they were dispensed, and
  kept separate from revenue.
- `daily` has one row per date in the range, zero-filled; week and month
  views are summed in the browser (weeks start Monday).
- **New vs returning**: a child is returning if they had a completed visit
  on an earlier date.
- **Average consultation**: from `consultation_started_at` (set by
  `start_consultation`; falls back to `called_at` for older visits) to
  `completed_at`.
- **Check-in hours** are clinic-local (`clinics.timezone`).
- **Same-day vs booked** (`walkInsVsAppointments`): tokens without / with an
  appointment, excluding removed tokens.
- **Follow-ups returned**: follow-ups due in the range (up to today) whose
  child had a completed visit within `follow_up_return_grace_days` (setting,
  default 7) of the due date.
- **Arrived** (`appointments.attended`): tokens issued in the range that are
  linked to a booking — counted on the day the child came, whatever date the
  booking was for. **Missed**: bookings in the range whose day passed with no
  check-in.
- **End of day** `notArrived`: still `booked` with no token — becomes
  `missed` after the day ends.
- **Owner usage** uses `visits.source` (`app` | `walk_in`, set by
  `add_walk_in`), across every clinic. `parentsRegistered` counts parents
  with a login (walk-in-only parents are excluded).

Doctor analytics never include ratings or install/notification adoption,
and the owner overview never includes revenue or children (brief 5.2/5.4).

---

## Maintenance (not part of the app's API)

`reset_clinic_data()` truncates every parent, child, visit, appointment,
session, medicine, pharmacy, rating, notification, push-subscription and
install row in one transaction, and returns the counts it cleared. Clinics,
settings and staff are kept. Execute is granted to `service_role` only, so
no signed-in user (owner included) can call it; `npm run reset` wraps it and
also removes prescription photos and parent logins.

---

## Settings

There is no `SettingsApi` — the brief's interface list doesn't include one.
Clinic-scoped config (`public.settings`, keyed `(clinic_id, key)`) is read
internally by the database functions that need it (e.g. the booking window
and session presets) rather than exposed as its own top-level surface.
