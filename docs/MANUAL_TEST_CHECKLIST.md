# Manual test checklist

Everything here could **not** be verified from the development machine — it
needs a deployed HTTPS URL, a real phone, or real time passing. Everything
else has been verified with the `npm run test:*` scripts and in a desktop
browser.

Test on at least one **iPhone (iOS 16.4+, Safari)** and one **Android phone
(Chrome)**.

## Before testing: deploy

- [ ] Deploy to Vercel (default `vercel.app` domain).
- [ ] Add every variable from `.env.example` to Vercel's environment settings,
      copying the values from `.env.local` (including `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
      `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NOTIFICATIONS_DISPATCH_SECRET`).
- [ ] In Supabase → Authentication → URL Configuration, set Site URL to the
      Vercel URL (it's still `http://localhost:3000`).
- [ ] Run `APP_URL=https://<your-app>.vercel.app npm run configure:dispatch` so
      scheduled reminders can trigger push delivery (see Phase 7).

## Phone layout (all screens)

- [ ] 375px-wide phone: no horizontal scroll on any screen, 320–430px.
- [ ] Notched phones: header, bottom tabs and sticky buttons clear the notch
      and the home indicator (safe areas).
- [ ] Every button is comfortable to tap (≥48px).
- [ ] Pinch-zoom works everywhere (it's deliberately not disabled).
- [ ] Light theme by default; switching the phone to dark mode follows.

## Tablet and laptop

Checked at 390px, 820px and ~1280px in a desktop browser. Still worth a pass
on real hardware:

- [ ] **Tablet portrait** (iPad ~820px): icon rail on the left, cards in two
      columns, sheets open as a right-hand drawer, main buttons sit inline.
- [ ] **Tablet landscape** (~1180px) and **laptop**: full sidebar with the app
      name and Sign out at the bottom; three-column card grids.
- [ ] Clicking outside a drawer closes it; Escape closes it.
- [ ] Touch on a tablet: every button still comfortable to tap.
- [ ] The doctor can run the day comfortably from a laptop at the front desk.

## Parent

- [ ] Phone OTP sign-in with a test number (`8088509302` / `123456`).
- [ ] **Real SMS** — only Supabase test numbers were used. Production needs a
      DLT-registered SMS provider (open item in the brief).
- [ ] Live queue screen keeps updating after the phone sleeps/wakes and after
      toggling airplane mode (reconnect + refetch).
- [ ] Visit summary → tap prescription photo → pinch-zoom and pan.
- [ ] **Download** saves the prescription to the phone.
- [ ] **Share** opens the phone's share sheet with the image (WhatsApp etc.).

## Install & notifications (Phase 6)

- [ ] **iOS Safari**: install popup shows the Share → Add to Home Screen steps.
- [ ] **Android Chrome**: popup shows an **Install app** button that opens
      Chrome's install dialog.
- [ ] **In-app browser** (open the link from WhatsApp): popup says to open in
      Safari/Chrome; "Copy link" works.
- [ ] "Not now" hides the popup for that visit only; the small banner stays;
      closing and reopening the browser shows the popup again.
- [ ] After getting a token, the popup appears again.
- [ ] Open the installed app: install is recorded, and back in the browser the
      popup is replaced by "open it from your home screen".
- [ ] Installed app shows **Turn on notifications**; tapping it shows the OS
      permission prompt; the card disappears once allowed.
- [ ] Deny permission → card switches to phone-Settings instructions.
- [ ] Not answering → card is back on the next app open.
- [ ] Phone locked, doctor taps **Call** → "Token N: it's your turn now"
      notification arrives.
- [ ] Two children waiting ahead → "you're 3rd in line" arrives once.
- [ ] Doctor taps **Recall** → the notification arrives again.
- [ ] Tapping a notification opens the app on the queue screen.

## Doctor

- [ ] **Native camera** opens from "Take photo" (rear camera), a real
      prescription photo uploads, and "retake" works.
- [ ] The photographed handwriting is legible after compression when zoomed.

## Pharmacist

- [ ] Feed updates live when the doctor completes a visit (on a second phone).

## Appointments & scheduled jobs (Phase 7)

- [ ] Reminders fire at the configured real-world times (defaults in
      `settings`: morning 08:00, evening 19:00, IST) — confirm the times with
      the clinic before launch (open item in the brief):
  - [ ] "Appointment today" in the morning.
  - [ ] "Appointment tomorrow" in the evening.
  - [ ] Follow-up reminder 2 days before the follow-up date.
- [ ] Those scheduled reminders also arrive as **push** (needs the deployed
      URL configured via `configure:dispatch`).
- [ ] An appointment with no check-in shows as **missed** the next day.
- [ ] Doctor reschedules / cancels a booking (or cancels a session or day) →
      the parent's phone gets the push notification.
- [ ] Approval workflow across two devices: parent requests on a phone → the
      doctor's **Alerts** badge appears live on another device → Approve →
      the parent's phone gets "Appointment confirmed" as a push notification.
      Repeat with Reject.
- [ ] Doctor push: booking requests reach the doctor in-app only (the staff
      terminal has no "turn on notifications" flow yet) — decide if the doctor
      should also get push.
- [ ] A parent arriving with a booking and checking in: the doctor's queue card
      shows the **Appointment** badge, and the token keeps its normal place.

## Analytics & owner dashboard (Phase 8)

The numbers are verified by `npm run test:analytics`; the doctor's
Analytics screen was checked in a desktop browser at 390px and 820px.

- [ ] **Owner dashboard** (not viewed during development — signing in needs
      the owner password): sign in at `/owner/login` with the owner login
      printed by `npm run provision`; check the rating, distribution,
      adoption tiles and usage bar on a phone and a laptop.
- [ ] Doctor or pharmacist signing in at `/owner/login` is refused; the
      owner signing in at `/admin/login` lands on `/owner`.
- [ ] Analytics on a real phone: charts readable, tapping a column shows its
      tooltip, "Table" switches every chart to numbers.
- [ ] Dark mode: chart colours stay distinguishable.
- [ ] Once real visits exist, spot-check End of day against the cash drawer
      and UPI app for one day.

## Before real patient data

- [ ] Privacy notice / parental consent screen — not built; flagged in the brief.
- [ ] Change the demo staff passwords set by `npm run provision`.
