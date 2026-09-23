/**
 * End-to-end check of the Phase 6 notification pipeline against the live
 * project:
 *
 *   - "you're 3rd in line" fires when a waiting child reaches exactly two
 *     waiting ahead — and only once per visit
 *   - "it's your turn" fires on Call, and again on Recall
 *   - parents see only their own notifications; delivery functions are
 *     service-role only
 *   - the dispatch route claims pending notifications and attempts delivery
 *
 * The dispatch check needs the app running:
 *   npm run dev -- -p 3200   (in another terminal)
 *   node --env-file=.env.local scripts/smoke-test-notifications.mjs
 *
 * Creates only its own data and undoes everything it touches.
 */
import { createECDH, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dispatchSecret = process.env.NOTIFICATIONS_DISPATCH_SECRET;
const appUrl = process.env.APP_URL ?? "http://localhost:3200";

if (!url || !anonKey || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/smoke-test-notifications.mjs");
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

function check(description, passed, detail) {
  console.log(`${passed ? "✓" : "✗"} ${description}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

function unwrap(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}

async function notificationsFor(client, visitId, type) {
  const rows = unwrap(
    `list ${type}`,
    await client.from("notifications").select("*").eq("visit_id", visitId).eq("type", type)
  );
  return rows;
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
  const { clinic_id: clinicId } = unwrap(
    "doctor staff row",
    await doctor.from("staff").select("clinic_id").single()
  );

  // Park any open consultation (only one may be open per clinic-day).
  const parked = unwrap(
    "open consultations",
    await admin
      .from("visits")
      .select("id, status")
      .eq("clinic_id", clinicId)
      .in("status", ["called", "in_consultation"])
  );
  if (parked.length > 0) {
    cleanups.push(async () => {
      for (const row of parked) {
        await admin.from("visits").update({ status: row.status }).eq("id", row.id);
      }
      console.log(`• restored ${parked.length} in-progress visit(s) found at start`);
    });
    for (const row of parked) {
      await admin.from("visits").update({ status: "waiting" }).eq("id", row.id);
    }
  }

  const { count: alreadyWaiting } = await admin
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("status", "waiting")
    .eq("visit_date", unwrap("today", await admin.rpc("clinic_today", { p_clinic_id: clinicId })));

  // --- 3rd in line ----------------------------------------------------------
  // Fillers belong to a throwaway parent with no account, so they receive
  // nothing themselves; they only shape the queue ahead of our child.
  const fillerParent = unwrap(
    "filler parent",
    await admin
      .from("parents")
      .insert({ phone: `notification-test-${Date.now()}` })
      .select("id")
      .single()
  );
  cleanups.push(() => admin.from("parents").delete().eq("id", fillerParent.id));

  const fillersNeeded = 3 - alreadyWaiting;
  let thirdInLineTested = false;

  const child = unwrap(
    "test child",
    await parent
      .from("children")
      .insert({ parent_id: profile.id, name: "Notification Test Child", dob: "2021-03-03" })
      .select("id")
      .single()
  );
  cleanups.push(() => admin.from("children").delete().eq("id", child.id));

  const fillerVisits = [];
  if (fillersNeeded >= 1) {
    for (let index = 0; index < fillersNeeded; index += 1) {
      const filler = unwrap(
        "filler child",
        await admin
          .from("children")
          .insert({ parent_id: fillerParent.id, name: `Filler ${index + 1}`, dob: "2020-01-01" })
          .select("id")
          .single()
      );
      fillerVisits.push(
        unwrap(
          "filler token",
          await admin.rpc("assign_token", {
            p_clinic_id: clinicId,
            p_child_id: filler.id,
            p_visit_reason: "general_checkup",
            p_appointment_id: null,
            p_enforce_parent_id: null,
          })
        )
      );
    }
    thirdInLineTested = true;
  }

  const visit = unwrap(
    "check in",
    await parent.rpc("check_in", { p_child_id: child.id, p_visit_reason: "vaccination" })
  );

  if (thirdInLineTested) {
    check(
      "no alert while three children are waiting ahead",
      (await notificationsFor(parent, visit.id, "third_in_line")).length === 0
    );

    unwrap(
      "remove a filler",
      await doctor.rpc("remove_visit", { p_visit_id: fillerVisits[0].id })
    );
    check(
      "\"3rd in line\" fires when two are left waiting ahead",
      (await notificationsFor(parent, visit.id, "third_in_line")).length === 1
    );

    unwrap(
      "remove another filler",
      await doctor.rpc("remove_visit", { p_visit_id: fillerVisits[1].id })
    );
    unwrap(
      "put a filler back in line",
      await admin.from("visits").update({ status: "waiting" }).eq("id", fillerVisits[1].id)
    );
    check(
      "…and only once per visit, however the queue shuffles",
      (await notificationsFor(parent, visit.id, "third_in_line")).length === 1
    );
  } else {
    console.log(
      `• skipped 3rd-in-line checks: ${alreadyWaiting} children already waiting today`
    );
  }

  // --- your turn ------------------------------------------------------------
  unwrap("call", await doctor.rpc("call_visit", { p_visit_id: visit.id }));
  check(
    "\"it's your turn\" fires when the doctor calls",
    (await notificationsFor(parent, visit.id, "your_turn")).length === 1
  );

  unwrap("recall", await doctor.rpc("call_visit", { p_visit_id: visit.id }));
  check(
    "…and fires again on Recall",
    (await notificationsFor(parent, visit.id, "your_turn")).length === 2
  );

  const yourTurn = (await notificationsFor(parent, visit.id, "your_turn"))[0];
  check(
    "the notification carries data, not wording",
    yourTurn.payload.child_name === "Notification Test Child" &&
      yourTurn.payload.seq === visit.seq
  );

  // --- who can see / do what ------------------------------------------------
  check(
    "the doctor cannot read a parent's notifications",
    unwrap(
      "doctor notifications",
      await doctor.from("notifications").select("id").eq("visit_id", visit.id)
    ).length === 0
  );

  const parentClaim = await parent.rpc("claim_pending_pushes", { p_limit: 5 });
  check(
    "a parent cannot claim deliveries",
    Boolean(parentClaim.error),
    parentClaim.error?.message
  );

  unwrap("mark read", await parent.rpc("mark_notifications_read", { p_ids: [yourTurn.id] }));
  const afterRead = unwrap(
    "after read",
    await parent.from("notifications").select("read_at").eq("id", yourTurn.id).single()
  );
  check("a parent can mark their notification read", afterRead.read_at !== null);

  // --- install tracking -----------------------------------------------------
  // This test parent is shared with manual testing: an install row would swap
  // their install popup for the "open from home screen" note, so only keep one
  // if it was already there.
  const priorInstall = unwrap(
    "prior install",
    await admin.from("installs").select("*").eq("parent_id", profile.id).maybeSingle()
  );
  cleanups.push(async () => {
    if (priorInstall) {
      await admin.from("installs").upsert(priorInstall);
    } else {
      await admin.from("installs").delete().eq("parent_id", profile.id);
    }
  });

  unwrap("record install", await parent.rpc("record_install"));
  unwrap("record notifications enabled", await parent.rpc("record_notifications_enabled"));
  const install = unwrap(
    "install status",
    await parent.from("installs").select("*").eq("parent_id", profile.id).single()
  );
  check(
    "install and notifications-enabled are recorded",
    Boolean(install.installed_at && install.notifications_enabled_at)
  );
  check(
    "the doctor cannot read install data",
    unwrap("doctor installs", await doctor.from("installs").select("*")).length === 0
  );

  // --- delivery -------------------------------------------------------------
  // A syntactically valid subscription the push service will refuse, so the
  // dispatcher's claim → send → outcome path runs for real.
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const endpoint = `https://fcm.googleapis.com/fcm/send/pedi-clinic-test-${Date.now()}`;
  unwrap(
    "register subscription",
    await parent.rpc("register_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: ecdh.getPublicKey().toString("base64url"),
      p_auth: randomBytes(16).toString("base64url"),
    })
  );
  cleanups.push(() => admin.from("push_subscriptions").delete().eq("endpoint", endpoint));

  let response;
  try {
    response = await fetch(`${appUrl}/api/notifications/dispatch`, {
      method: "POST",
      headers: { authorization: `Bearer ${dispatchSecret}` },
    });
  } catch {
    console.log(`• skipped dispatch checks: app not reachable at ${appUrl}`);
    return;
  }

  const unauthorized = await fetch(`${appUrl}/api/notifications/dispatch`, {
    method: "POST",
    headers: { authorization: "Bearer wrong-secret" },
  });
  check("dispatch rejects a wrong secret", unauthorized.status === 401);

  const body = await response.json();
  check(
    "dispatch claims pending notifications and attempts delivery",
    response.ok && body.claimed >= 1,
    JSON.stringify(body)
  );

  const attempted = unwrap(
    "attempted",
    await admin
      .from("notifications")
      .select("push_attempted_at")
      .eq("visit_id", visit.id)
  );
  check(
    "claimed notifications are never pushed twice",
    attempted.every((row) => row.push_attempted_at !== null)
  );

  const second = await fetch(`${appUrl}/api/notifications/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${dispatchSecret}` },
  }).then((r) => r.json());
  check("a second dispatch finds nothing left to send", second.claimed === 0, JSON.stringify(second));
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
