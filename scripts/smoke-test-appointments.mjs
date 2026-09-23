/**
 * End-to-end check of Phase 7 against the live project: availability,
 * booking rules, doctor changes (and the notifications they send), arrival
 * linking, and each scheduled job.
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
    await parent.rpc("upsert_parent_profile", { p_name: "Appointments Test Parent" })
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

  async function createSession(date, start, end, max) {
    const session = unwrap(
      `create session ${date} ${start}`,
      await doctor.rpc("create_session", {
        p_clinic_id: clinicId,
        p_date: date,
        p_start_time: start,
        p_end_time: end,
        p_max_bookings: max,
      })
    );
    sessions.push(session.id);
    return session;
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

  // --- availability -------------------------------------------------------
  const morning = await createSession(day, "09:00", "11:00", 2);
  const afternoon = await createSession(day, "15:00", "17:00", 1);

  check(
    "overlapping sessions are refused",
    refusedWith(
      await doctor.rpc("create_session", {
        p_clinic_id: clinicId,
        p_date: day,
        p_start_time: "10:30",
        p_end_time: "12:00",
        p_max_bookings: 1,
      }),
      "SESSION_OVERLAP"
    )
  );
  check(
    "the pharmacist cannot create sessions",
    refusedWith(
      await pharmacist.rpc("create_session", {
        p_clinic_id: clinicId,
        p_date: day,
        p_start_time: "18:00",
        p_end_time: "19:00",
        p_max_bookings: 1,
      }),
      "FORBIDDEN"
    )
  );

  // --- booking ------------------------------------------------------------
  const bookA = unwrap(
    "book A",
    await parent.rpc("book_appointment", { p_session_id: morning.id, p_child_id: children.A.id })
  );
  check(
    "a parent's booking starts as a request awaiting approval",
    bookA.status === "pending"
  );

  check(
    "one appointment per child per day",
    refusedWith(
      await parent.rpc("book_appointment", {
        p_session_id: afternoon.id,
        p_child_id: children.A.id,
      }),
      "APPOINTMENT_EXISTS_FOR_DAY"
    )
  );

  unwrap(
    "book B",
    await parent.rpc("book_appointment", { p_session_id: morning.id, p_child_id: children.B.id })
  );
  check(
    "a full session refuses further bookings",
    refusedWith(
      await parent.rpc("book_appointment", {
        p_session_id: morning.id,
        p_child_id: children.C.id,
      }),
      "SESSION_FULL"
    )
  );

  const outside = await createSession(addDays(today, 7), "09:00", "10:00", 3);
  check(
    "parents can't book beyond the booking window",
    refusedWith(
      await parent.rpc("book_appointment", {
        p_session_id: outside.id,
        p_child_id: children.C.id,
      }),
      "OUTSIDE_BOOKING_WINDOW"
    )
  );

  const sessionsList = unwrap(
    "list sessions",
    await parent.rpc("appointment_sessions", {
      p_clinic_id: clinicId,
      p_from: day,
      p_to: day,
    })
  );
  check(
    "open-session listing reports slots taken",
    sessionsList.find((s) => s.session_id === morning.id)?.booked_count === 2
  );

  // --- parent changes: no notification ------------------------------------
  const bMoved = unwrap(
    "parent reschedules B",
    await parent.rpc("reschedule_appointment", {
      p_appointment_id: (
        unwrap(
          "B's appointment",
          await admin
            .from("appointments")
            .select("id")
            .eq("child_id", children.B.id)
            .in("status", ["pending", "booked"])
            .single()
        )
      ).id,
      p_new_session_id: afternoon.id,
    })
  );
  check("a parent can reschedule within the window", bMoved.session_id === afternoon.id);
  check(
    "a parent's own change sends them no notification",
    unwrap(
      "B notifications",
      await parent.from("notifications").select("id").eq("appointment_id", bMoved.id)
    ).length === 0
  );

  const mine = unwrap("my appointments", await parent.rpc("my_appointments"));
  check(
    "my appointments lists upcoming bookings",
    mine.some((row) => row.appointment_id === bookA.id) &&
      mine.some((row) => row.appointment_id === bMoved.id)
  );

  // --- doctor changes: parent notified ------------------------------------
  const aMoved = unwrap(
    "doctor reschedules A outside the window",
    await doctor.rpc("reschedule_appointment", {
      p_appointment_id: bookA.id,
      p_new_session_id: outside.id,
    })
  );
  check("the doctor isn't held to the booking window", aMoved.session_id === outside.id);
  check("the doctor moving a request confirms it", aMoved.status === "booked");

  const moved = unwrap(
    "A notifications",
    await parent.from("notifications").select("type, payload").eq("appointment_id", bookA.id)
  );
  check(
    "the parent is told when the doctor moves an appointment",
    moved.length === 1 &&
      moved[0].type === "appointment_changed" &&
      moved[0].payload.change === "rescheduled"
  );

  const cancelledBySession = unwrap(
    "cancel afternoon session",
    await doctor.rpc("cancel_session", { p_session_id: afternoon.id })
  );
  const bAfter = unwrap(
    "B after session cancel",
    await admin.from("appointments").select("status").eq("id", bMoved.id).single()
  );
  check(
    "cancelling a session cancels its bookings",
    cancelledBySession === 1 && bAfter.status === "cancelled"
  );
  check(
    "…and tells each parent",
    unwrap(
      "B cancel notification",
      await parent
        .from("notifications")
        .select("payload")
        .eq("appointment_id", bMoved.id)
        .eq("type", "appointment_changed")
    ).some((row) => row.payload.change === "cancelled")
  );

  const parentCancel = unwrap(
    "parent cancels A",
    await parent.rpc("cancel_appointment", { p_appointment_id: bookA.id })
  );
  check("a parent can cancel, with no cutoff", parentCancel.status === "cancelled");

  // Close day
  const closing = await createSession(addDays(today, 4), "09:00", "10:00", 2);
  const bookC = unwrap(
    "book C",
    await parent.rpc("book_appointment", { p_session_id: closing.id, p_child_id: children.C.id })
  );
  const closed = unwrap(
    "close day",
    await doctor.rpc("close_day", { p_clinic_id: clinicId, p_date: addDays(today, 4) })
  );
  check(
    "\"mark day closed\" cancels that day's bookings and notifies",
    closed === 1 &&
      unwrap(
        "C notifications",
        await parent.from("notifications").select("id").eq("appointment_id", bookC.id)
      ).length === 1
  );

  // Copy week: the week containing `day` copied forward seven days.
  const copied = unwrap(
    "copy week",
    await doctor.rpc("copy_week", {
      p_clinic_id: clinicId,
      p_from_week_start: day,
      p_to_week_start: addDays(day, 7),
    })
  );
  // Everything copy_week made lands in the target week and was created during
  // this run — track it all for cleanup, not just the day we assert on.
  const copiedSessions = unwrap(
    "copied sessions",
    await admin
      .from("availability_sessions")
      .select("id, date, start_time")
      .eq("clinic_id", clinicId)
      .gte("date", addDays(day, 7))
      .lte("date", addDays(day, 13))
      .gte("created_at", startedAt)
  );
  sessions.push(...copiedSessions.map((s) => s.id));
  check(
    "\"copy last week\" repeats live sessions (not cancelled ones)",
    copied === copiedSessions.length &&
      copiedSessions.some(
        (s) => s.date === addDays(day, 7) && s.start_time.startsWith("09:00")
      ) &&
      !copiedSessions.some(
        (s) => s.date === addDays(day, 7) && s.start_time.startsWith("15:00")
      ),
    `${copied} created`
  );

  // --- approval workflow -----------------------------------------------------
  const approvalSession = await createSession(addDays(today, 3), "09:00", "10:00", 2);

  const requestH = unwrap(
    "book H",
    await parent.rpc("book_appointment", {
      p_session_id: approvalSession.id,
      p_child_id: children.H.id,
    })
  );
  const doctorInbox = unwrap(
    "doctor inbox",
    await doctor
      .from("notifications")
      .select("id, type, read_at")
      .eq("appointment_id", requestH.id)
  );
  check(
    "the doctor gets a booking request",
    doctorInbox.length === 1 && doctorInbox[0].type === "booking_request"
  );

  check(
    "a parent cannot approve their own request",
    refusedWith(
      await parent.rpc("decide_appointment", { p_appointment_id: requestH.id, p_approve: true }),
      "FORBIDDEN"
    )
  );

  const approved = unwrap(
    "approve H",
    await doctor.rpc("decide_appointment", { p_appointment_id: requestH.id, p_approve: true })
  );
  check("approving confirms the booking", approved.status === "booked");

  const parentApproval = unwrap(
    "parent approval notice",
    await parent
      .from("notifications")
      .select("type, payload")
      .eq("appointment_id", requestH.id)
  );
  check(
    "the parent is told it was approved",
    parentApproval.some(
      (row) => row.type === "booking_update" && row.payload.decision === "approved"
    )
  );
  check(
    "the doctor's request is marked read once decided",
    unwrap(
      "request read",
      await doctor.from("notifications").select("read_at").eq("id", doctorInbox[0].id).single()
    ).read_at !== null
  );
  check(
    "a request can only be decided once",
    refusedWith(
      await doctor.rpc("decide_appointment", { p_appointment_id: requestH.id, p_approve: false }),
      "INVALID_APPOINTMENT_STATUS"
    )
  );

  const requestI = unwrap(
    "book I",
    await parent.rpc("book_appointment", {
      p_session_id: approvalSession.id,
      p_child_id: children.I.id,
    })
  );
  check(
    "a pending request holds its slot",
    refusedWith(
      await parent.rpc("book_appointment", {
        p_session_id: approvalSession.id,
        p_child_id: children.J.id,
      }),
      "SESSION_FULL"
    )
  );

  const rejected = unwrap(
    "reject I",
    await doctor.rpc("decide_appointment", { p_appointment_id: requestI.id, p_approve: false })
  );
  check("rejecting marks the request not approved", rejected.status === "rejected");
  check(
    "the parent is told it was rejected",
    unwrap(
      "parent rejection notice",
      await parent
        .from("notifications")
        .select("payload")
        .eq("appointment_id", requestI.id)
        .eq("type", "booking_update")
    ).some((row) => row.payload.decision === "rejected")
  );
  check(
    "rejecting frees the slot",
    unwrap(
      "book J after rejection",
      await parent.rpc("book_appointment", {
        p_session_id: approvalSession.id,
        p_child_id: children.J.id,
      })
    ).status === "pending"
  );
  check(
    "the parent still sees a rejected request, labelled",
    unwrap("my appointments after rejection", await parent.rpc("my_appointments")).some(
      (row) => row.appointment_id === requestI.id && row.status === "rejected"
    )
  );

  // A parent moving a confirmed booking sends it back for approval.
  const movedBack = unwrap(
    "parent moves H",
    await parent.rpc("reschedule_appointment", {
      p_appointment_id: requestH.id,
      p_new_session_id: morning.id,
    })
  );
  check(
    "a parent moving a confirmed booking needs re-approval",
    movedBack.status === "pending" &&
      unwrap(
        "new request",
        await doctor
          .from("notifications")
          .select("id")
          .eq("appointment_id", requestH.id)
          .eq("type", "booking_request")
      ).length === 2
  );

  // Deleting: only your own notifications.
  const [firstRequest] = unwrap(
    "doctor requests",
    await doctor.from("notifications").select("id").eq("appointment_id", requestH.id)
  );
  await parent.from("notifications").delete().eq("id", firstRequest.id);
  check(
    "a parent cannot delete the doctor's notification",
    unwrap(
      "still there",
      await admin.from("notifications").select("id").eq("id", firstRequest.id)
    ).length === 1
  );
  unwrap("doctor deletes", await doctor.from("notifications").delete().eq("id", firstRequest.id));
  check(
    "the doctor can delete their own notification",
    unwrap(
      "gone",
      await admin.from("notifications").select("id").eq("id", firstRequest.id)
    ).length === 0
  );

  // --- arrival links the appointment ---------------------------------------
  // Inserted directly so the check doesn't depend on the time of day.
  const todaySession = unwrap(
    "today's session",
    await admin
      .from("availability_sessions")
      .insert({
        clinic_id: clinicId,
        date: today,
        start_time: "00:00",
        end_time: "23:59",
        max_bookings: 5,
      })
      .select("id")
      .single()
  );
  sessions.push(todaySession.id);
  const todayAppointment = unwrap(
    "today's appointment",
    await admin
      .from("appointments")
      .insert({ session_id: todaySession.id, child_id: children.D.id, appointment_date: today })
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

  const queue = unwrap(
    "doctor queue",
    await doctor.rpc("doctor_queue", { p_clinic_id: clinicId })
  );
  check(
    "the doctor's queue shows the appointment badge",
    queue.find((row) => row.visit_id === visit.id)?.has_appointment === true
  );

  // --- scheduled jobs --------------------------------------------------------
  const yesterdaySession = unwrap(
    "yesterday's session",
    await admin
      .from("availability_sessions")
      .insert({
        clinic_id: clinicId,
        date: addDays(today, -1),
        start_time: "09:00",
        end_time: "10:00",
        max_bookings: 5,
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
      })
      .select("id")
      .single()
  );
  unwrap(
    "mark missed",
    await admin.rpc("mark_missed_appointments", { p_clinic_id: clinicId, p_today: today })
  );
  check(
    "yesterday's booking with no token is marked missed",
    unwrap(
      "no-show status",
      await admin.from("appointments").select("status").eq("id", noShow.id).single()
    ).status === "missed"
  );

  const tomorrowSession = unwrap(
    "tomorrow's session",
    await admin
      .from("availability_sessions")
      .insert({
        clinic_id: clinicId,
        date: tomorrow,
        start_time: "10:00",
        end_time: "12:00",
        max_bookings: 5,
      })
      .select("id")
      .single()
  );
  sessions.push(tomorrowSession.id);
  const tomorrowAppointment = unwrap(
    "tomorrow's appointment",
    await admin
      .from("appointments")
      .insert({ session_id: tomorrowSession.id, child_id: children.F.id, appointment_date: tomorrow })
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
