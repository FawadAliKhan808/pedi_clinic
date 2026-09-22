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
| `getMyProfile` | — | `Parent \| null` (`null` until first-login name step is done) | `PARENT_PROFILE_LOOKUP_FAILED` | Signed-in parent |
| `completeProfile` | `{ name }` | `Parent` | `NOT_AUTHENTICATED`, `MISSING_PHONE`, `PARENT_PROFILE_SAVE_FAILED` | Signed-in parent; upserts the row for `auth.uid()` |
| `listMyChildren` | — | `Child[]` | `CHILDREN_LIST_FAILED` | Signed-in parent; own children only |
| `addChild` | `{ name, dob }` | `Child` | `PROFILE_INCOMPLETE`, `CHILD_ADD_FAILED` | Signed-in parent; own children only |

RLS (`parents_select_own` / `parents_insert_own` / `parents_update_own`,
`children_select_own` / `children_insert_own` / `children_update_own`)
scopes every row to `auth.uid()`. `doctor`/`pharmacist` staff additionally
get read access (`parents_select_staff`, `children_select_staff`) for
search and the pharmacy feed — see `QueueApi`/`PharmacyApi` below.

---

## QueueApi — Not implemented (Phase 2)

| Method | Input | Output |
|---|---|---|
| `getTodayQueue` | `clinicId` | `Visit[]` |
| `checkIn` | `{ childId, visitReason, appointmentId? }` | `Visit` |
| `call` / `skip` / `recall` / `remove` | `visitId` | `Visit` |
| `searchChildren` | `clinicId, query` | `Child[]` |
| `addWalkIn` | `{ name, dob, parentPhone, visitReason }` | `Visit` |

`checkIn` must be backed by a race-safe Postgres function assigning the
next sequential token per `(clinic_id, visit_date)` inside a transaction —
see brief Section 3 ("Race-sensitive logic must live in the database").

`addWalkIn` needs a parent record that can exist before any `auth.users`
row does (attaches to a phone number, auto-claimed on that parent's first
OTP login). The current `parents` schema requires `user_id`; this needs a
schema change (e.g. a nullable `user_id` with a claim step) before this
method can be implemented — flagged here rather than built silently.

## VisitsApi — Not implemented (Phase 3)

| Method | Input | Output |
|---|---|---|
| `getVisit` / `getChildHistory` | `visitId` / `childId` | `Visit` / `Visit[]` |
| `addPrescriptionImages` | `visitId, storageKeys[]` | `void` |
| `setFees` | `visitId, fees` | `Fees` |
| `recordPayments` | `visitId, payments[]` | `Payment[]` (amounts must sum exactly to the fee total — enforced server-side) |
| `setFollowUpDate` | `visitId, date \| null` | `Visit` |
| `completeVisit` | `visitId` | `Visit` (transactional: locks fees/payments, advances queue, notifies pharmacy) |
| `submitRating` | `visitId, stars` | `void` |

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

## StorageApi — Not implemented (Phase 3)

| Method | Input | Output |
|---|---|---|
| `uploadPrescriptionImage` | `visitId, file, order` | `string` (opaque storage key, not a URL) |
| `getSignedUrl` | `storageKey, expiresInSeconds?` | `string` |

Prescription images live in a private bucket; only short-lived signed URLs
are ever handed to a client.

## RealtimeApi — Not implemented (Phase 2/4/6)

| Method | Input | Output |
|---|---|---|
| `subscribeToQueue` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToPharmacyFeed` | `clinicId, onChange` | `Unsubscribe` |
| `subscribeToNotifications` | `userId, onChange` | `Unsubscribe` |

---

## Settings

There is no `SettingsApi` — the brief's interface list doesn't include one.
Clinic-scoped config (`public.settings`, keyed `(clinic_id, key)`) is read
internally by whichever domain adapter needs it (e.g. `QueueApi.checkIn`
reading the daily per-phone token limit) rather than exposed as its own
top-level surface.
