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

## RealtimeApi — `subscribeToQueue` implemented (Phase 2)

| Method | Input | Output |
|---|---|---|
| `subscribeToQueue` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToPharmacyFeed` | — | throws `NOT_IMPLEMENTED` (Phase 4) |
| `subscribeToNotifications` | — | throws `NOT_IMPLEMENTED` (Phase 6) |

A database trigger on `visits` broadcasts to the `queue:{clinic_id}` channel
on every change. The payload carries **no personal data** — only which clinic
changed — because parents can't be granted read access to each other's rows;
each side refetches its own read model instead. `onChange` also fires on
(re)subscribe, which is what recovers state after a dropped connection.

## VisitsApi — Implemented (rating lands in Phase 5)

| Method | Input | Output | Errors | Auth |
|---|---|---|---|---|
| `getVisit` | `visitId` | `Visit` | `VISIT_LOOKUP_FAILED` | Parent of that child, or clinic staff |
| `getChildHistory` | `childId` | `ChildVisitHistoryEntry[]`, newest first | `CHILD_HISTORY_FAILED` | Parent of that child, or clinic staff |
| `completeVisit` | `CompleteVisitInput` | `Visit` | `FORBIDDEN`, `VISIT_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `INVALID_FEE_AMOUNT`, `PAYMENT_TOTAL_MISMATCH` | Clinic doctor |
| `submitRating` | `visitId, stars` | throws `NOT_IMPLEMENTED` (Phase 5) | | |

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

## PharmacyApi — Not implemented (Phase 4)

| Method | Input | Output |
|---|---|---|
| `getFeed` | `clinicId` | `PharmacyOrder[]` |
| `searchMedicines` | `clinicId, query` | `Medicine[]` |
| `dispense` | `{ visitId, items[] }` | `PharmacyOrder` (single atomic transaction; rejects on insufficient stock) |
| `skipOrder` | `visitId` | `void` |
| `restock` | `medicineId, quantity` | `Medicine` |
| `addMedicine` | `{ name, unit, initialStock, lowStockThreshold }` | `Medicine` |

## AppointmentsApi — Not implemented (Phase 7)

| Method | Input | Output |
|---|---|---|
| `listOpenSessions` | `clinicId, fromDate, toDate` | `AvailabilitySession[]` |
| `book` | `{ sessionId, childId }` | `Appointment` |
| `reschedule` | `appointmentId, newSessionId` | `Appointment` |
| `cancel` | `appointmentId` | `void` |
| `listMyAppointments` | — | `Appointment[]` |
| `createSession` | `AvailabilitySession` (minus id/bookedCount) | `AvailabilitySession` |
| `cancelSession` | `sessionId` | `void` |
| `closeDay` | `clinicId, date` | `void` |
| `copyWeek` | `clinicId, fromWeekStart, toWeekStart` | `void` |

Booking/cancel must be race-safe transactional Postgres functions (brief
Section 3).

## NotificationsApi — Not implemented (Phase 6)

| Method | Input | Output |
|---|---|---|
| `listMine` | — | `AppNotification[]` |
| `markRead` | `notificationId` | `void` |
| `registerPushSubscription` | `PushSubscriptionJSON` | `void` |
| `recordInstall` | — | `void` (fires once per parent) |

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
