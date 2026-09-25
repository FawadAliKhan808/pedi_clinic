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

## Polish & demo readiness (Phase 9)

- [ ] **Clear the test data first** (not run yet, see below):
      `npm run db:push`, then `npm run reset` (dry run), then
      `npm run reset -- --yes`.
- [ ] **Full run-through on a real phone** (brief Phase 9): parent check-in
      → doctor calls → complete the visit with a **split payment** →
      pharmacist dispenses → parent sees the summary → parent leaves a rating
      → the owner dashboard shows it.
- [ ] **Installable**: on the deployed URL, Chrome DevTools → Application →
      Manifest shows no installability errors, and Android Chrome offers
      "Install app". (Lighthouse no longer has a PWA category; the
      manifest, icons and service worker were checked locally.)
- [ ] **Offline**: turn on airplane mode on the live queue → the "You're
      offline" banner appears and the last queue stays on screen; turn it
      off → the banner goes and the queue catches up.
- [ ] Open the app from the home screen while offline → the offline page.
- [ ] A failed first load (e.g. open a screen in airplane mode after the
      app is already open) shows "Couldn't load this" with Try again, not an
      endless loading skeleton.
- [ ] An unknown URL shows the "Page not found" screen.
- [ ] Parent screens at 320px and 430px wide: no sideways scroll. (Staff
      and public screens were checked in a desktop browser at 320, 375 and
      430px; parent screens need a parent sign-in, so check them on a phone.)
- [ ] After signing out on a shared phone, a prescription photo isn't
      still viewable offline (the service worker no longer caches
      cross-origin images).

## Appointments, check-in and screens (latest changes)

Database rules are covered by `npm run test:appointments` and
`npm run test:concurrency`; these screens weren't viewed in a browser during
development (no signed-in session was available):

- [ ] **Availability**: "Morning (10 am – 1 pm)" and "Evening (6 pm – 9 pm)"
      add that session in one tap and then show as open; "Or a custom time"
      takes plain text ("5pm", "5:30 pm", "17:30"), shows how it read each
      field, and refuses an end before the start. No dropdowns, no slot counts.
- [ ] Each session card on Availability lists every child booked, their reason,
      parent name and a tap-to-call number.
- [ ] **Booking (parent)** feels like check-in: child → reason → day and
      session → "Book appointment". It's confirmed at once ("Booked"), with no
      "awaiting approval". Several children can book the same session.
- [ ] **Doctor → Appointments**: each session shows who booked and why (name,
      reason, age, parent, phone), plus a "3 booked · 2 vaccination, 1 general
      checkup" line. No approve/reject buttons anywhere.
- [ ] **Doctor → Notification** (renamed from Alerts): "New appointment: …"
      with the reason; tapping "See all bookings" opens Appointments.
- [ ] **Check-in with an upcoming booking**: book a child for a later day, then
      check that child in today → "Are you coming for the same reason you
      booked your upcoming appointment?" → **Yes** gives a token straight away
      with the booked reason, and the booking disappears from Appointments;
      **No** goes to the normal reason choice.
- [ ] **Last visits** (renamed from Records): every finished visit as a card
      (child, date, reason, fee, follow-up, prescription photos, "View visit
      summary"), newest first; filter chips for child and reason; "Clear
      filters" when nothing matches.
- [ ] **Missed**: a booking whose day passes with no check-in shows as Missed
      the next morning; **Analytics → Trends** shows "Appointments kept" and
      the "Booked appointments" attended-vs-missed chart; End of day shows the
      same split.
- [ ] **Analytics**: Total collected, Consultations and Pharmacy sales tiles;
      the Pharmacy sales chart.
- [ ] **Doctor → Queue → tap a child**: parent's name and phone.
- [ ] **Parent → Your queue** shows only today's active tokens.
- [ ] **Rating** is asked once per parent, ever.
- [ ] **Parent notifications (bell)**: the bin button deletes one.

## Locked bookings, queue dot, AM/PM, patient history

Rules are covered by the test scripts; these screens weren't viewed in a
browser during development:

- [ ] **Parents can't cancel or reschedule**: parent Appointments shows
      bookings with no buttons ("Bookings can't be changed once made").
- [ ] **Doctor cancels**: "Cancel session" (Availability or Appointments) and
      "Cancel day" / "Mark day closed" warn how many parents will be told; after
      tapping, the bookings show Cancelled and each parent's bell shows "Your
      appointment has been cancelled." (plus a push on an installed phone).
- [ ] **Queue dot**: with nobody waiting the Queue tab is plain; check a child
      in from a phone → an orange dot appears on Queue on the doctor's screen
      (any tab, phone/tablet/laptop) without a refresh; complete the last one →
      the dot goes.
- [ ] **Custom session AM/PM**: type "5" or "5:30" (number pad on a phone), tap
      the AM/PM button beside each box to flip it; "Reads as 5:30 PM" confirms;
      typing "5pm" also flips the button.
- [ ] **History tab** (doctor): only children whose consultation was
      completed — a child still waiting, or a parent who only registered, never
      appears. Today by default (a child appears the moment their visit is
      completed); ‹ › and the date box pick any day; Reason filter; search by
      child name, parent name or phone.
- [ ] Tapping a patient opens their timeline: every past consultation, newest
      first — date, token, reason, booked-appointment tag, minutes with the
      doctor, fees and how they were paid, follow-up, medicines dispensed, and
      a **View prescription** button (one photo opens full screen; several show
      as thumbnails).

## Live updates

Broadcasts are verified by `npm run test:appointments`; these need two real
devices side by side:

- [ ] Doctor adds a session → the parent's open booking screen shows it
      without a refresh; cancelling it removes it (and clears it if selected).
- [ ] Parent books → the doctor's Appointments and Availability lists show the
      child and reason at once.
- [ ] Doctor calls a token → the parent's home token card and Your queue
      update live; the pharmacist feed updates when a visit completes.
- [ ] Lock the phone for a few minutes, unlock → screens catch up on their own.

## Summary auto-open, stock search, live owner, install and notification prompts

- [ ] **Visit summary opens by itself**: parent has the app open (any screen)
      while their child is with the doctor → the doctor completes the visit →
      the parent's screen jumps to that visit's summary. Opening the app later
      does *not* jump to an old summary.
- [ ] **Stock search and filters** (pharmacist): typing filters by name; the
      All / In stock / Low stock / Out of stock chips show counts and filter;
      out-of-stock and low items sort to the top; "Show all medicines" clears.
- [ ] **Owner dashboard live**: keep `/owner` open, install the app on a
      phone (or turn on notifications, or leave a rating) → the numbers update
      within a second or two, no reload.
- [ ] **After installing** from a browser tab (Android Chrome "Install app"):
      the tab is covered by "App installed successfully! Please close this
      browser tab and open Pedi Clinic directly from your phone's home screen
      to continue." with no way back into the tab.
- [ ] **Notification prompt** (installed app, notifications not yet decided):
  - [ ] First time on Home this visit → one soft modal, "Get live alerts when
        your turn is approaching". Moving between screens doesn't bring it back;
        nothing repeats on a timer.
  - [ ] Get a token → the queue screen opens the modal ("…almost your
        turn?"); book an appointment → the Appointments screen opens it
        ("…reminded about this appointment").
  - [ ] "Not now" (or tapping outside / Escape) → no more modals this visit;
        a compact banner stays at the top: "Enable notifications for live queue
        alerts [Turn on]".
  - [ ] **Allow** or **Block** (from the modal or the banner) → modal and
        banner are gone for good; after Block, Home shows how to unblock.
  - [ ] In a browser tab (Android Chrome): no modals — the install prompt owns
        those moments — just the banner. iPhone Safari (not installed): nothing,
        since iOS only allows notifications in the installed app.

## QA fixes (dates, age, phones, children, bookings, guardrail, analytics, skip/remove)

- [ ] Date-of-birth pickers (add/edit child, doctor's walk-in) stop at today,
      and a typed future date is refused. History and Analytics pickers stop at
      today. The follow-up date is the one picker that looks forward (it's a
      future date by nature); booking uses the session picker.
- [ ] Open a consultation, pick a follow-up date, close without completing
      (confirm "Discard") → open the next child's consultation: follow-up is
      empty.
- [ ] Ages everywhere read "2 years, 3 months, 5 days" / "3 months, 12 days" /
      "12 days"; check one against a calendar.
- [ ] Phone fields (parent sign-in, walk-in): 9 digits or 11 digits or
      letters show an error and the button stays disabled; exactly 10 works.
- [ ] Home → pencil on a child → edit name/date of birth → saved; "Delete" on
      a child added by mistake (two taps) removes them; on a child who has
      visited, it explains they can't be deleted.
- [ ] Check a child in → on Home their card shows a "Currently in queue"
      label; on the check-in screen that child shows "Currently in queue" and
      can't be picked while the other children can. After the visit is
      completed, they can check in again.
- [ ] Book a child for a day, then try booking the same child again: that day
      shows "Already booked" and can't be chosen. Another child can still book
      it.
- [ ] Doctor: enter an amount or a photo in the visit summary, tap Close →
      "Are you sure? Unsaved data will be lost." — Keep editing / Discard and
      close. With nothing entered, Close just closes.
- [ ] Analytics: "Appointments arrived" counts a child who checked in with a
      booking on the day they came (including "same reason" early check-ins).
      A "Revenue by fee type" section shows Consultation and Vaccination fees
      (and Other when used) with their share — End of day and Trends.
- [ ] Doctor taps Skip / Remove → the parent's phone gets "Token N was
      skipped" / "Token N was removed from the queue" (push on an installed
      phone; always in the bell).

## Home bottom dock

- [ ] Home, on a phone, a tablet and a laptop: the bottom dock sits at the
      very bottom of the screen (just above the tab bar on phones), not in the
      middle of the page — with one child or many. Scrolling a long page keeps
      it pinned.
- [ ] Inside it, top to bottom: "Know about your doctor", the "Enable
      notifications for live queue alerts" banner (only while notifications
      are undecided), then the wide orange **Check in** button. Once
      notifications are allowed or blocked, the link sits right above Check in.
- [ ] Child cards have no check-in button of their own.
- [ ] On other parent screens the notification banner is at the top of the
      screen (not the bottom), and their main buttons (Book an appointment,
      Get token) are also pinned to the bottom on every screen size.

## Before real patient data

- [ ] Privacy notice / parental consent screen — not built; flagged in the brief.
- [ ] Change the demo staff passwords set by `npm run provision`.
