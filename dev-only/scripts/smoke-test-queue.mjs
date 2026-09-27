/**
 * End-to-end check of the Phase 2 queue flow against the live project, as a
 * real parent and a real doctor (so RLS and the SECURITY DEFINER functions
 * are all exercised for real):
 *
 *   parent OTP sign-in → profile → child → check-in
 *   doctor sign-in → queue → call → skip → recall
 *   parent sees the status change and their queue position
 *
 *   node --env-file=.env.local scripts/smoke-test-queue.mjs
 *
 * Uses a Supabase test phone number with a fixed OTP, and cleans up after.
 */
import { createClient } from "@supabase/supabase-js";
import { checkInCode } from "./checkin-code.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/smoke-test-queue.mjs");
  process.exit(1);
}

const TEST_PHONE = process.env.DEMO_TEST_PHONE ?? "8088509302";
const TEST_OTP = process.env.DEMO_TEST_OTP ?? "123456";
const DOCTOR_EMAIL = process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test";
const DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo";

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function newClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let failures = 0;
function check(description, passed, detail) {
  console.log(`${passed ? "✓" : "✗"} ${description}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

/** Throws on failure; once the test child exists, the `finally` below still removes it. */
function unwrap(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}

// --- parent ---------------------------------------------------------------
const parent = newClient();
await parent.auth.signInWithOtp({ phone: TEST_PHONE });
const session = unwrap(
  "parent OTP verify",
  await parent.auth.verifyOtp({ phone: TEST_PHONE, token: TEST_OTP, type: "sms" })
);
check("parent signed in with phone OTP", Boolean(session.user));

const profile = unwrap(
  "parent profile",
  await parent.rpc("upsert_parent_profile", {}) /* keeps any name the tester gave */
);
check("parent profile claimed/created", profile.phone === TEST_PHONE);

const child = unwrap(
  "add child",
  await parent
    .from("children")
    .insert({ parent_id: profile.id, name: "Smoke Test Child", dob: "2022-03-15" })
    .select("*")
    .single()
);
check("parent added a child under RLS", child.parent_id === profile.id);

try {
// Check-in only works with a fresh code from the reception screen's QR.
for (const [label, code] of [["no code", null], ["a made-up code", "0123456789abcdef0123"]]) {
  const refused = await parent.rpc("check_in", {
    p_child_id: child.id,
    p_visit_reason: "general_checkup",
    p_checkin_code: code,
  });
  check(
    `check-in with ${label} is refused`,
    Boolean(refused.error?.message?.includes("CHECKIN_CODE_INVALID")),
    refused.error?.message ?? "a token was issued"
  );
}

const visit = unwrap(
  "check in",
  await parent.rpc("check_in", { p_checkin_code: await checkInCode(),
    p_child_id: child.id,
    p_visit_reason: "general_checkup",
  })
);
check("check-in assigned a token", Number.isInteger(visit.seq), `token ${visit.seq}`);

// While a child is in the queue they can't get a second token.
const second = await parent.rpc("check_in", { p_checkin_code: await checkInCode(),
  p_child_id: child.id,
  p_visit_reason: "vaccination",
});
check(
  "a child already in the queue can't check in again",
  Boolean(second.error?.message?.includes("ACTIVE_TOKEN_EXISTS")),
  second.error?.message ?? "second token was issued"
);
if (second.data) await admin.from("visits").delete().eq("id", second.data.id);

// No daily limit per phone: several more children from the same parent all
// check in (the old limit was 3 a day). Removed again straight away.
const extraChildren = unwrap(
  "extra children",
  await parent
    .from("children")
    .insert(
      [1, 2, 3, 4].map((n) => ({ parent_id: profile.id, name: `Smoke Extra ${n}`, dob: "2022-01-01" }))
    )
    .select("id")
);
const extra = [];
for (const extraChild of extraChildren) {
  extra.push(
    await parent.rpc("check_in", { p_checkin_code: await checkInCode(), p_child_id: extraChild.id, p_visit_reason: "general_checkup" })
  );
}
check(
  "a parent can take as many tokens a day as they need",
  extra.every((result) => !result.error),
  extra.find((result) => result.error)?.error.message
);
await admin.from("children").delete().in("id", extraChildren.map((row) => row.id));

// A parent must not be able to read the visits table directly beyond their own.
const otherRows = unwrap(
  "parent visit visibility",
  await parent.from("visits").select("id, child_id")
);
// The test parent may be a real tester with children of their own, so
// "own" means any child of this parent (checked with the service role).
const ownChildIds = new Set(
  unwrap(
    "this parent's children",
    await admin.from("children").select("id").eq("parent_id", profile.id)
  ).map((row) => row.id)
);
check(
  "parent sees only their own children's visits",
  otherRows.length > 0 && otherRows.every((row) => ownChildIds.has(row.child_id)),
  `${otherRows.length} row(s) visible, all own: ${otherRows.every((row) => ownChildIds.has(row.child_id))}`
);

// --- doctor ---------------------------------------------------------------
const doctor = newClient();
unwrap(
  "doctor sign-in",
  await doctor.auth.signInWithPassword({
    email: DOCTOR_EMAIL,
    password: DOCTOR_PASSWORD,
  })
);

const staff = unwrap(
  "doctor staff row",
  await doctor.from("staff").select("role, clinic_id").single()
);
check("doctor role resolved server-side", staff.role === "doctor");

const queue = unwrap(
  "doctor queue",
  await doctor.rpc("doctor_queue", { p_clinic_id: staff.clinic_id })
);
const queued = queue.find((row) => row.visit_id === visit.id);
check("the token appears in the doctor's queue", Boolean(queued));
check(
  "queue row carries child, age and new/returning",
  queued?.child_name === "Smoke Test Child" &&
    queued?.child_dob === "2022-03-15" &&
    queued?.is_returning === false
);

const called = unwrap("call", await doctor.rpc("call_visit", { p_visit_id: visit.id }));
check("doctor called the child", called.status === "called");

const skipped = unwrap("skip", await doctor.rpc("skip_visit", { p_visit_id: visit.id }));
check("doctor skipped the child", skipped.status === "skipped");
check(
  "the parent is told their token was skipped",
  unwrap(
    "skip notice",
    await parent
      .from("notifications")
      .select("type")
      .eq("visit_id", visit.id)
      .eq("type", "token_skipped")
  ).length === 1
);

const skippedQueue = unwrap(
  "queue after skip",
  await doctor.rpc("doctor_queue", { p_clinic_id: staff.clinic_id })
);
check(
  "a skipped card sorts to the end of the queue",
  skippedQueue.at(-1)?.visit_id === visit.id
);

const recalled = unwrap(
  "recall",
  await doctor.rpc("call_visit", { p_visit_id: visit.id })
);
check("doctor recalled the skipped child", recalled.status === "called");

// --- parent sees it live --------------------------------------------------
const parentView = unwrap("parent queue view", await parent.rpc("parent_queue_view"));
const mine = parentView.find((row) => row.visit_id === visit.id);
check("parent's queue view reflects the doctor's action", mine?.status === "called");
// Real tokens may be in today's queue too (the project is shared with manual
// testing), so the expected position comes from the queue as it is.
const earlierWaiting = unwrap(
  "earlier waiting tokens",
  await admin
    .from("visits")
    .select("id", { count: "exact" })
    .eq("clinic_id", visit.clinic_id)
    .eq("visit_date", visit.visit_date)
    .eq("status", "waiting")
    .lt("seq", visit.seq)
).length;
check(
  "parent's queue view reports now-serving and position",
  mine?.now_serving_seq === visit.seq && mine?.patients_ahead === earlierWaiting,
  `now serving ${mine?.now_serving_seq}, ${mine?.patients_ahead} ahead (expected ${earlierWaiting})`
);

// --- a pharmacist must not be able to run doctor-only actions -------------
const walkInAsParent = await parent.rpc("add_walk_in", {
  p_clinic_id: staff.clinic_id,
  p_child_name: "Should Not Exist",
  p_child_dob: "2021-01-01",
  p_parent_phone: "9999999999",
  p_visit_reason: "vaccination",
});
check(
  "a parent cannot create a walk-in",
  Boolean(walkInAsParent.error),
  walkInAsParent.error?.message
);


// Removing the token tells the parent too.
unwrap("remove", await doctor.rpc("remove_visit", { p_visit_id: visit.id }));
check(
  "the parent is told their token was removed",
  unwrap(
    "remove notice",
    await parent
      .from("notifications")
      .select("type")
      .eq("visit_id", visit.id)
      .eq("type", "token_removed")
  ).length === 1
);
} catch (error) {
  console.error("✗", error.message);
  failures += 1;
} finally {
  // Visits cascade from the child.
  await admin.from("children").delete().eq("id", child.id);
  console.log("• cleaned up test data");
}

process.exit(failures === 0 ? 0 : 1);
