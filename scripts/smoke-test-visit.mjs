/**
 * End-to-end check of the Phase 3 visit completion flow against the live
 * project, including who is allowed to see the money:
 *
 *   doctor uploads a prescription photo → completes with split payments
 *   parent sees their own fees; the pharmacist sees the photo but not the bill
 *
 *   node --env-file=.env.local scripts/smoke-test-visit.mjs
 *
 * Creates only its own data and undoes everything it touches — including
 * putting back any consultation that was already open when it started.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/smoke-test-visit.mjs");
  process.exit(1);
}

const TEST_PHONE = process.env.DEMO_TEST_PHONE ?? "8088509302";
const TEST_OTP = process.env.DEMO_TEST_OTP ?? "123456";

const ONE_PIXEL_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const newClient = () =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const cleanups = [];
let failures = 0;

function check(description, passed, detail) {
  console.log(`${passed ? "✓" : "✗"} ${description}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function runCleanups() {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch (error) {
      console.error("  cleanup step failed:", error.message);
    }
  }
}

function unwrap(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}

async function signIn(email, password) {
  const client = newClient();
  unwrap(`${email} sign-in`, await client.auth.signInWithPassword({ email, password }));
  return client;
}

async function main() {
  // --- set the stage: a child in consultation ------------------------------
  const parent = newClient();
  await parent.auth.signInWithOtp({ phone: TEST_PHONE });
  unwrap(
    "parent OTP verify",
    await parent.auth.verifyOtp({ phone: TEST_PHONE, token: TEST_OTP, type: "sms" })
  );
  const profile = unwrap(
    "parent profile",
    await parent.rpc("upsert_parent_profile", { p_name: "Visit Test Parent" })
  );

  const child = unwrap(
    "add child",
    await parent
      .from("children")
      .insert({ parent_id: profile.id, name: "Visit Test Child", dob: "2021-05-10" })
      .select("*")
      .single()
  );
  cleanups.push(() => admin.from("children").delete().eq("id", child.id));

  const doctor = await signIn(
    process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test",
    process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo"
  );
  const staff = unwrap(
    "doctor staff row",
    await doctor.from("staff").select("clinic_id").single()
  );

  // Only one consultation may be open per clinic-day. If someone is mid-demo,
  // park their visit and put it back exactly as found.
  const parked = unwrap(
    "look for an open consultation",
    await admin
      .from("visits")
      .select("id, status")
      .eq("clinic_id", staff.clinic_id)
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

  const visit = unwrap(
    "check in",
    await parent.rpc("check_in", {
      p_child_id: child.id,
      p_visit_reason: "vaccination",
    })
  );
  cleanups.push(() => admin.from("visits").delete().eq("id", visit.id));

  unwrap("call", await doctor.rpc("call_visit", { p_visit_id: visit.id }));
  unwrap("start consultation", await doctor.rpc("start_consultation", { p_visit_id: visit.id }));

  // --- prescription photo --------------------------------------------------
  const storageKey = `${visit.id}/0-smoke-test.jpg`;
  cleanups.push(() => admin.storage.from("prescriptions").remove([storageKey]));

  const upload = await doctor.storage
    .from("prescriptions")
    .upload(storageKey, ONE_PIXEL_JPEG, { contentType: "image/jpeg", upsert: true });
  check("doctor can upload a prescription photo", !upload.error, upload.error?.message);

  // --- completion ----------------------------------------------------------
  const mismatch = await doctor.rpc("complete_visit", {
    p_visit_id: visit.id,
    p_consultation: 300,
    p_vaccination: 200,
    p_other: 0,
    p_payments: [{ mode: "cash", amount: 400 }],
  });
  check(
    "payments that don't add up to the total are refused",
    Boolean(mismatch.error),
    mismatch.error?.message
  );

  const completed = unwrap(
    "complete visit",
    await doctor.rpc("complete_visit", {
      p_visit_id: visit.id,
      p_consultation: 300,
      p_vaccination: 200,
      p_other: 0,
      p_payments: [
        { mode: "cash", amount: 200 },
        { mode: "upi", amount: 300 },
      ],
      p_follow_up_date: "2026-10-06",
      p_prescription_keys: [storageKey],
    })
  );
  check("visit completed", completed.status === "completed");
  check("follow-up date recorded", completed.follow_up_date === "2026-10-06");

  const queueAfter = unwrap(
    "doctor queue after completion",
    await doctor.rpc("doctor_queue", { p_clinic_id: staff.clinic_id })
  );
  check(
    "the completed visit leaves the queue",
    !queueAfter.some((row) => row.visit_id === visit.id)
  );

  const doctorPayments = unwrap(
    "doctor payments",
    await doctor.from("payments").select("mode, amount").eq("visit_id", visit.id)
  );
  check(
    "split payment stored as one row per mode",
    doctorPayments.length === 2 &&
      Number(doctorPayments.find((p) => p.mode === "cash")?.amount) === 200 &&
      Number(doctorPayments.find((p) => p.mode === "upi")?.amount) === 300
  );

  // --- who can see the money -----------------------------------------------
  const parentFees = unwrap(
    "parent fees",
    await parent.from("fees").select("*").eq("visit_id", visit.id)
  );
  check("the parent can see their own bill", parentFees.length === 1);

  const pharmacist = await signIn(
    process.env.DEMO_PHARMACIST_EMAIL ?? "pharmacist@pediclinic.test",
    process.env.DEMO_PHARMACIST_PASSWORD ?? "pedi-pharmacist-demo"
  );

  check(
    "the pharmacist cannot see fees",
    unwrap("pharmacist fees", await pharmacist.from("fees").select("*").eq("visit_id", visit.id))
      .length === 0
  );
  check(
    "the pharmacist cannot see payments",
    unwrap(
      "pharmacist payments",
      await pharmacist.from("payments").select("*").eq("visit_id", visit.id)
    ).length === 0
  );
  check(
    "the pharmacist can see the prescription photo",
    unwrap(
      "pharmacist images",
      await pharmacist.from("prescription_images").select("*").eq("visit_id", visit.id)
    ).length === 1
  );

  // --- history read model --------------------------------------------------
  const parentHistory = unwrap(
    "parent history",
    await parent.rpc("child_visit_history", { p_child_id: child.id })
  );
  check(
    "parent history shows the fee total and photo",
    Number(parentHistory[0]?.fee_total) === 500 &&
      parentHistory[0]?.storage_keys?.length === 1
  );

  const pharmacistHistory = unwrap(
    "pharmacist history",
    await pharmacist.rpc("child_visit_history", { p_child_id: child.id })
  );
  check(
    "pharmacist history withholds the fee total",
    pharmacistHistory[0]?.fee_total === null
  );

  // --- private bucket ------------------------------------------------------
  const parentSigned = await parent.storage
    .from("prescriptions")
    .createSignedUrl(storageKey, 60);
  check("the parent can sign a URL for their own prescription", !parentSigned.error);

  const anonStatus = await fetch(
    `${url}/storage/v1/object/prescriptions/${storageKey}`
  ).then((response) => response.status);
  check(
    "the photo is not publicly readable",
    anonStatus >= 400 && anonStatus < 500,
    `HTTP ${anonStatus}`
  );
}

try {
  await main();
} catch (error) {
  console.error("✗", error.message);
  failures += 1;
} finally {
  await runCleanups();
  console.log("• cleaned up test data");
}

process.exit(failures === 0 ? 0 : 1);
