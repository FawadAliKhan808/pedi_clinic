/**
 * End-to-end check of appointments against the live project: open
 * sessions (presets, any times, no capacity), instant booking with a reason,
 * doctor changes (and the notifications they send), arrival linking —
 * including "same reason as your upcoming booking?" — and each scheduled job.
 *
 *   node --env-file=.env.local scripts/smoke-test-appointments.mjs
 *
 * Scheduled jobs are exercised by calling each job function directly with an
 * explicit date, so the test doesn't depend on what time it is run.
 * Creates only its own data and removes it afterwards.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/smoke-test-appointments.mjs");
  process.exit(1);
}

const TEST_PHONE = process.env.DEMO_TEST_PHONE ?? "8088509302";
const TEST_OTP = process.env.DEMO_TEST_OTP ?? "123456";

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const newClient = () =>
  createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const cleanups = [];
let failures = 0;
const startedAt = new Date().toISOString();

function check(description, passed, detail) {
  console.log(`${passed ? "✓" : "✗"} ${description}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

function unwrap(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}

function refusedWith(result, code) {
  return Boolean(result.error?.message?.includes(code));
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  // --- actors ---------------------------------------------------------------
  const parent = newClient();
  await parent.auth.signInWithOtp({ phone: TEST_PHONE });
  unwrap(
    "parent OTP verify",
    await parent.auth.verifyOtp({ phone: TEST_PHONE, token: TEST_OTP, type: "sms" })
  );
  const profile = unwrap(
    "parent profile",
    await parent.rpc("upsert_parent_profile", {}) /* keeps any name the tester gave */
  );

  const doctor = newClient();
  unwrap(
    "doctor sign-in",
    await doctor.auth.signInWithPassword({
      email: process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test",
      password: process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo",
    })
  );
  const pharmacist = newClient();
  unwrap(
    "pharmacist sign-in",
    await pharmacist.auth.signInWithPassword({
      email: process.env.DEMO_PHARMACIST_EMAIL ?? "pharmacist@pediclinic.test",
      password: process.env.DEMO_PHARMACIST_PASSWORD ?? "pedi-pharmacist-demo",
    })
  );

  const [window] = unwrap("booking window", await parent.rpc("booking_window"));
  const clinicId = window.clinic_id;
  const today = window.today;
  const tomorrow = addDays(today, 1);
  const windowDays =
    (new Date(window.to_date) - new Date(window.from_date)) / 86_400_000 + 1;
  check(
    "booking window comes from settings, in clinic time",
    windowDays === 7,
    `${window.from_date} → ${window.to_date}`
  );

  const sessions = [];
  cleanups.push(async () => {
    if (sessions.length) {
      await admin.from("availability_sessions").delete().in("id", sessions);
    }
  });

  // Any times: capacity doesn't exist any more.
  async function createSession(date, start, end) {
    const session = unwrap(
      `create session ${date} ${start}`,
      await doctor.rpc("create_session", {
        p_clinic_id: clinicId,
        p_date: date,
        p_start_time: start,
        p_end_time: end,
      })
    );
    sessions.push(session.id);
    return session;
  }

  function book(sessionId, child, reason = "general_checkup") {
    return parent.rpc("book_appointment", {
      p_session_id: sessionId,
      p_child_id: child.id,
      p_visit_reason: reason,
    });
  }

  const children = {};
  for (const name of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]) {
    children[name] = unwrap(
      `child ${name}`,
      await parent
        .from("children")
        .insert({ parent_id: profile.id, name: `Appointment Test ${name}`, dob: "2022-02-02" })
        .select("id")
        .single()
    );
  }
  cleanups.push(() =>
    admin.from("children").delete().in("id", Object.values(children).map((c) => c.id))
  );

  // Use a day past any real bookings: the last day of the window.
  const day = addDays(today, 5);

  // --- live updates --------------------------------------------------------
  // An open booking screen listens on the clinic's appointments channel.
  let liveEvents = 0;
  const liveChannel = parent.channel(`appointments:${clinicId}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("realtime subscribe timed out")), 15000);
    liveChannel
      .on("broadcast", { event: "appointments_changed" }, () => {
        liveEvents += 1;
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        }
      });
  });
  cleanups.push(() => parent.removeChannel(liveChannel));
  // Give the channel a moment to settle after joining before counting on it.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  async function receivedLiveUpdate(since) {
    for (let waited = 0; waited < 10000; waited += 250) {
      if (liveEvents > since) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  // --- availability -------------------------------------------------------
  check(
    "the one-tap session presets come from settings",
    JSON.stringify(window.session_presets?.map((preset) => preset.label)) ===
      JSON.stringify(["Morning", "Evening"]),
    JSON.stringify(window.session_presets)
  );

  const beforeSession = liveEvents;
  const morning = await createSession(day, "10:00", "13:00");
  check(
    "a new session reaches open booking screens live",
    await receivedLiveUpdate(beforeSession)
  );
  const evening = await createSession(day, "18:00", "21:00");
  // Custom times aren't tied to any grid.
  const custom = await createSession(day, "14:15", "15:40");
  check("a custom session can use any times", custom.start_time === "14:15:00");

  check(
    "overlapping sessions are refused",
    refusedWith(
      await doctor.rpc("create_session", {
        p_clinic_id: clinicId,
        p_date: day,
        p_start_time: "12:00",
        p_end_time: "14:00",
      }),
      "SESSION_OVERLAP"
    )
  );
  check(
    "an end before the start is refused",
    refusedWith(
      await doctor.rpc("create_session", {
        p_clinic_id: clinicId,
        p_date: day,
        p_start_time: "22:00",
        p_end_time: "21:30",
      }),
      "INVALID_SESSION_TIMES"
    )
  );
  check(
    "the pharmacist cannot create sessions",
    refusedWith(
      await pharmacist.rpc("create_session", {
        p_clinic_id: clinicId,
        p_date: day,
        p_start_time: "07:00",
        p_end_time: "08:00",
      }),
      "FORBIDDEN"
    )
  );

  // --- booking: confirmed at once, with a reason, no limit -------------------
  const beforeBooking = liveEvents;
  const bookA = unwrap("book A", await book(evening.id, children.A, "vaccination"));
  check("a booking is confirmed straight away (no approval)", bookA.status === "booked");
  check("the booking keeps its reason for visit", bookA.visit_reason === "vaccination");
  check("a booking reaches other open screens live", await receivedLiveUpdate(beforeBooking));

  const request = unwrap(
    "doctor's notification",
    await doctor
      .from("notifications")
      .select("type, payload")
      .eq("appointment_id", bookA.id)
  );
  check(
    "the doctor is told who booked and why",
    request.length === 1 &&
      request[0].type === "booking_request" &&
      request[0].payload.child_name === "Appointment Test A" &&
      request[0].payload.visit_reason === "vaccination"
  );

  check(
    "a booking needs a reason",
    Boolean(
      (
        await parent.rpc("book_appointment", {
          p_session_id: evening.id,
          p_child_id: children.B.id,
          p_visit_reason: null,
        })
      ).error
    )
  );

  // Sessions have no capacity: many children can book the same one.
  const many = await Promise.all(
    [children.B, children.C, children.D, children.E, children.F].map((child) =>
      book(evening.id, child)
    )
  );
  check(
    "any number of children can book one session",
    many.every((result) => !result.error),
    many.find((result) => result.error)?.error.message
  );

  const againForA = await book(morning.id, children.A);
  check(
    "a child can book twice on the same day",
    !againForA.error,
    againForA.error?.message
  );

  const outside = await createSession(addDays(today, 7), "10:00", "13:00");
  check(
    "parents can't book beyond the booking window",
    refusedWith(await book(outside.id, children.G), "OUTSIDE_BOOKING_WINDOW")
  );

  const sessionsList = unwrap(
    "list sessions",
    await parent.rpc("appointment_sessions", { p_clinic_id: clinicId, p_from: day, p_to: day })
  );
  check(
    "the session listing counts bookings (no capacity field)",
    sessionsList.find((row) => row.session_id === evening.id)?.booked_count === 6 &&
      !("max_bookings" in (sessionsList[0] ?? {}))
  );

  const schedule = unwrap(
    "doctor schedule",
    await doctor.rpc("clinic_appointments", { p_clinic_id: clinicId, p_from: day, p_to: day })
  );
  const eveningRows = schedule.filter((row) => row.session_id === evening.id && row.appointment_id);
  check(
    "the doctor sees each child who booked, with their reason",
    eveningRows.length === 6 &&
      eveningRows.some(
        (row) => row.child_name === "Appointment Test A" && row.visit_reason === "vaccination"
      ) &&
      eveningRows.every((row) => row.visit_reason && row.child_name)
  );
  check(
    "the pharmacist can't see who booked",
    unwrap(
      "pharmacist schedule",
      await pharmacist.rpc("clinic_appointments", { p_clinic_id: clinicId, p_from: day, p_to: day })
    ).length === 0
  );

  const mine = unwrap("my appointments", await parent.rpc("my_appointments"));
  check(
    "my appointments lists bookings with their reason",
    mine.some((row) => row.appointment_id === bookA.id && row.visit_reason === "vaccination")
  );

  // --- parents can't change a booking; the doctor can cancel ----------------
  const bookB = many[0].data;
  for (const [fn, args] of [
    ["reschedule_appointment", { p_appointment_id: bookB.id, p_new_session_id: morning.id }],
    ["cancel_appointment", { p_appointment_id: bookB.id }],
  ]) {
    check(`nobody can call ${fn}`, Boolean((await parent.rpc(fn, args)).error));
  }
  check(
    "a parent can't cancel a session",
    refusedWith(await parent.rpc("cancel_session", { p_session_id: evening.id }), "FORBIDDEN")
  );

  const cancelledCount = unwrap(
    "doctor cancels the evening session",
    await doctor.rpc("cancel_session", { p_session_id: evening.id })
  );
  const eveningAfter = unwrap(
    "evening bookings after",
    await admin.from("appointments").select("id, status").eq("session_id", evening.id)
  );
  check(
    "cancelling a session cancels every booking in it",
    cancelledCount === 6 &&
      eveningAfter.length === 6 &&
      eveningAfter.every((row) => row.status === "cancelled"),
    `${cancelledCount} cancelled`
  );
  const cancelNotices = unwrap(
    "parent's cancellation notices",
    await parent
      .from("notifications")
      .select("appointment_id, type, payload")
      .eq("type", "appointment_changed")
      .in("appointment_id", eveningAfter.map((row) => row.id))
  );
  check(
    "each parent is told their appointment was cancelled",
    cancelNotices.length === 6 && cancelNotices.every((row) => row.payload.change === "cancelled")
  );
  check(
    "a cancelled session takes no new bookings",
    refusedWith(await book(evening.id, children.G), "SESSION_CANCELLED")
  );

  unwrap("cancel empty session", await doctor.rpc("cancel_session", { p_session_id: custom.id }));
  check(
    "an empty session can be cancelled too",
    unwrap(
      "custom after",
      await admin.from("availability_sessions").select("cancelled_at").eq("id", custom.id).single()
    ).cancelled_at !== null
  );

  // Close day: cancels that day's sessions and bookings, and tells the parents.
  const closingDay = addDays(today, 4);
  const closing = await createSession(closingDay, "18:00", "21:00");
  const bookC = unwrap("book C", await book(closing.id, children.C));
  const closedCount = unwrap(
    "close day",
    await doctor.rpc("close_day", { p_clinic_id: clinicId, p_date: closingDay })
  );
  check(
    "\"mark day closed\" cancels that day's bookings and tells the parent",
    closedCount === 1 &&
      unwrap(
        "booking after close",
        await admin.from("appointments").select("status").eq("id", bookC.id).single()
      ).status === "cancelled" &&
      unwrap(
        "close-day notice",
        await parent
          .from("notifications")
          .select("payload")
          .eq("appointment_id", bookC.id)
          .eq("type", "appointment_changed")
      ).some((row) => row.payload.change === "cancelled")
  );

  // Copy a week. Uses an empty week about two months out (its own session
  // only), so it can never copy — or leave behind — anyone's real sessions.
  const farMonday = (() => {
    const date = new Date(`${addDays(today, 60)}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  })();
  const nextMonday = addDays(farMonday, 7);
  cleanups.push(() =>
    admin
      .from("availability_sessions")
      .delete()
      .eq("clinic_id", clinicId)
      .gte("date", farMonday)
      .lte("date", addDays(nextMonday, 6))
      .gt("created_at", startedAt)
  );
  unwrap(
    "source-week session",
    await admin
      .from("availability_sessions")
      .insert({ clinic_id: clinicId, date: addDays(farMonday, 2), start_time: "18:00", end_time: "21:00" })
  );
  const copied = unwrap(
    "copy week",
    await doctor.rpc("copy_week", {
      p_clinic_id: clinicId,
      p_from_week_start: farMonday,
      p_to_week_start: nextMonday,
    })
  );
  const copiedAgain = unwrap(
    "copy week again",
    await doctor.rpc("copy_week", {
      p_clinic_id: clinicId,
      p_from_week_start: farMonday,
      p_to_week_start: nextMonday,
    })
  );
  check(
    "\"copy last week\" repeats a week's sessions, and never doubles them",
    copied === 1 && copiedAgain === 0,
    `${copied}, then ${copiedAgain}`
  );

  // Deleting: only your own notifications.
  const [firstRequest] = unwrap(
    "doctor notes",
    await doctor.from("notifications").select("id").eq("appointment_id", bookB.id)
  );
  await parent.from("notifications").delete().eq("id", firstRequest.id);
  check(
    "a parent cannot delete the doctor's notification",
    unwrap("still there", await admin.from("notifications").select("id").eq("id", firstRequest.id))
      .length === 1
  );
  unwrap("doctor deletes", await doctor.from("notifications").delete().eq("id", firstRequest.id));
  check(
    "the doctor can delete their own notification",
    unwrap("gone", await admin.from("notifications").select("id").eq("id", firstRequest.id))
      .length === 0
  );

  // --- arrival links the appointment ---------------------------------------
  // Inserted directly so the check doesn't depend on the time of day.
  const todaySession = unwrap(
    "today's session",
    await admin
      .from("availability_sessions")
      .insert({ clinic_id: clinicId, date: today, start_time: "00:00", end_time: "23:59" })
      .select("id")
      .single()
  );
  sessions.push(todaySession.id);
  const todayAppointment = unwrap(
    "today's appointment",
    await admin
      .from("appointments")
      .insert({
        session_id: todaySession.id,
        child_id: children.D.id,
        appointment_date: today,
        status: "booked",
        visit_reason: "general_checkup",
      })
      .select("id")
      .single()
  );

  const visit = unwrap(
    "check in with an appointment",
    await parent.rpc("check_in", { p_child_id: children.D.id, p_visit_reason: "general_checkup" })
  );
  const attended = unwrap(
    "appointment after check-in",
    await admin.from("appointments").select("status").eq("id", todayAppointment.id).single()
  );
  check(
    "checking in links today's appointment and marks it attended",
    visit.appointment_id === todayAppointment.id && attended.status === "attended"
  );

  const queue = unwrap("doctor queue", await doctor.rpc("doctor_queue", { p_clinic_id: clinicId }));
  check(
    "the doctor's queue shows the appointment badge",
    queue.find((row) => row.visit_id === visit.id)?.has_appointment === true
  );

  // --- "coming for the same reason?" — an upcoming booking used today --------
  const upcoming = unwrap("H's upcoming booking", await book(morning.id, children.H, "vaccination"));
  const sameReason = unwrap(
    "check in with the upcoming booking",
    await parent.rpc("check_in", {
      p_child_id: children.H.id,
      p_visit_reason: "general_checkup",
      p_appointment_id: upcoming.id,
    })
  );
  const upcomingAfter = unwrap(
    "upcoming booking after",
    await admin.from("appointments").select("status").eq("id", upcoming.id).single()
  );
  check(
    "\"yes, same reason\" makes today's token from the upcoming booking",
    sameReason.visit_reason === "vaccination" &&
      sameReason.appointment_id === upcoming.id &&
      upcomingAfter.status === "attended",
    `${sameReason.visit_reason}, booking ${upcomingAfter.status}`
  );
  unwrap(
    "take H's token back out",
    await admin.from("visits").delete().eq("id", sameReason.id)
  );

  // Someone else's booking can't be used (or marked attended) by this parent.
  const otherParent = unwrap(
    "another family",
    await admin.from("parents").insert({ phone: `appointments-other-${Date.now()}` }).select("id").single()
  );
  cleanups.push(() => admin.from("parents").delete().eq("id", otherParent.id));
  const otherChild = unwrap(
    "their child",
    await admin
      .from("children")
      .insert({ parent_id: otherParent.id, name: "Other Family Child", dob: "2021-01-01" })
      .select("id")
      .single()
  );
  const theirBooking = unwrap(
    "their booking",
    await admin
      .from("appointments")
      .insert({
        session_id: morning.id,
        child_id: otherChild.id,
        appointment_date: day,
        status: "booked",
        visit_reason: "vaccination",
      })
      .select("id")
      .single()
  );
  check(
    "a parent can't use another family's booking at check-in",
    refusedWith(
      await parent.rpc("check_in", {
        p_child_id: children.I.id,
        p_visit_reason: "general_checkup",
        p_appointment_id: theirBooking.id,
      }),
      "APPOINTMENT_NOT_FOUND"
    ) &&
      unwrap(
        "their booking after",
        await admin.from("appointments").select("status").eq("id", theirBooking.id).single()
      ).status === "booked"
  );

  // --- scheduled jobs --------------------------------------------------------
  const yesterdaySession = unwrap(
    "yesterday's session",
    await admin
      .from("availability_sessions")
      .insert({
        clinic_id: clinicId,
        date: addDays(today, -1),
        start_time: "18:00",
        end_time: "21:00",
      })
      .select("id")
      .single()
  );
  sessions.push(yesterdaySession.id);
  const noShow = unwrap(
    "no-show appointment",
    await admin
      .from("appointments")
      .insert({
        session_id: yesterdaySession.id,
        child_id: children.E.id,
        appointment_date: addDays(today, -1),
        status: "booked",
        visit_reason: "general_checkup",
      })
      .select("id")
      .single()
  );
  unwrap(
    "mark missed",
    await admin.rpc("mark_missed_appointments", { p_clinic_id: clinicId, p_today: today })
  );
  check(
    "the daily cleanup marks a past booking with no check-in as missed",
    unwrap(
      "no-show status",
      await admin.from("appointments").select("status").eq("id", noShow.id).single()
    ).status === "missed"
  );

  const tomorrowSession = unwrap(
    "tomorrow's session",
    await admin
      .from("availability_sessions")
      .insert({ clinic_id: clinicId, date: tomorrow, start_time: "10:00", end_time: "13:00" })
      .select("id")
      .single()
  );
  sessions.push(tomorrowSession.id);
  const tomorrowAppointment = unwrap(
    "tomorrow's appointment",
    await admin
      .from("appointments")
      .insert({
        session_id: tomorrowSession.id,
        child_id: children.F.id,
        appointment_date: tomorrow,
        status: "booked",
        visit_reason: "general_checkup",
      })
      .select("id")
      .single()
  );

  const reminderArgs = {
    p_clinic_id: clinicId,
    p_kind: "appointment_tomorrow",
    p_date: tomorrow,
  };
  unwrap("evening reminders", await admin.rpc("send_appointment_reminders", reminderArgs));
  unwrap("evening reminders again", await admin.rpc("send_appointment_reminders", reminderArgs));
  const tomorrowNotes = unwrap(
    "tomorrow notifications",
    await parent
      .from("notifications")
      .select("payload")
      .eq("appointment_id", tomorrowAppointment.id)
      .eq("type", "appointment_tomorrow")
  );
  check(
    "\"appointment tomorrow\" is sent once, with the session time",
    tomorrowNotes.length === 1 && tomorrowNotes[0].payload.start_time === "10:00"
  );

  // Follow-up: set yesterday for two days from now → due this morning, once.
  const followUpVisit = unwrap(
    "follow-up visit",
    await admin.rpc("assign_token", {
      p_clinic_id: clinicId,
      p_child_id: children.G.id,
      p_visit_reason: "general_checkup",
      p_appointment_id: null,
      p_enforce_parent_id: null,
    })
  );
  unwrap(
    "complete follow-up visit",
    await admin
      .from("visits")
      .update({
        status: "completed",
        completed_at: new Date(Date.now() - 86_400_000).toISOString(),
        follow_up_date: addDays(today, 2),
      })
      .eq("id", followUpVisit.id)
  );

  const beforeDue = unwrap(
    "follow-up too early",
    await admin.rpc("send_follow_up_reminders", {
      p_clinic_id: clinicId,
      p_today: addDays(today, -1),
    })
  );
  check("a follow-up isn't reminded before its lead time", beforeDue === 0);

  unwrap(
    "follow-up due",
    await admin.rpc("send_follow_up_reminders", { p_clinic_id: clinicId, p_today: today })
  );
  unwrap(
    "follow-up again",
    await admin.rpc("send_follow_up_reminders", { p_clinic_id: clinicId, p_today: today })
  );
  check(
    "a follow-up is reminded two days ahead, once",
    unwrap(
      "follow-up notifications",
      await parent
        .from("notifications")
        .select("id")
        .eq("visit_id", followUpVisit.id)
        .eq("type", "follow_up_reminder")
    ).length === 1
  );

  const run = unwrap("run scheduled jobs", await admin.rpc("run_scheduled_jobs"));
  check("the scheduler runs cleanly", typeof run.notifications_created === "number", JSON.stringify(run));

  check(
    "parents can't trigger scheduled jobs",
    Boolean((await parent.rpc("run_scheduled_jobs")).error)
  );
}

try {
  await main();
} catch (error) {
  console.error("✗", error.message);
  failures += 1;
} finally {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch (error) {
      console.error("  cleanup step failed:", error.message);
    }
  }
  console.log("• cleaned up test data");
}

process.exit(failures === 0 ? 0 : 1);
