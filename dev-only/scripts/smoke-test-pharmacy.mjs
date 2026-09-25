/**
 * End-to-end check of the Phase 4 pharmacy flow against the live project:
 *
 *   completed visit reaches the feed → pharmacist dispenses → stock deducted,
 *   bill priced → the skip path clears a visit instead
 *
 *   node --env-file=.env.local scripts/smoke-test-pharmacy.mjs
 *
 * Creates only its own data and undoes everything it touches, including any
 * consultation it had to park.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/smoke-test-pharmacy.mjs");
  process.exit(1);
}

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

function unwrap(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}

async function signIn(email, password) {
  const client = newClient();
  unwrap(`${email} sign-in`, await client.auth.signInWithPassword({ email, password }));
  return client;
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

/** Completes a throwaway visit so it lands on the pharmacy feed. */
async function completedVisit(doctor, clinicId, childName) {
  const parent = unwrap(
    "test parent",
    await admin
      .from("parents")
      .upsert({ phone: `pharmacy-test-${Date.now()}` }, { onConflict: "phone" })
      .select("id")
      .single()
  );
  cleanups.push(() => admin.from("parents").delete().eq("id", parent.id));

  const child = unwrap(
    "test child",
    await admin
      .from("children")
      .insert({ parent_id: parent.id, name: childName, dob: "2022-01-01" })
      .select("id")
      .single()
  );

  const visit = unwrap(
    "assign token",
    await admin.rpc("assign_token", {
      p_clinic_id: clinicId,
      p_child_id: child.id,
      p_visit_reason: "general_checkup",
      p_appointment_id: null,
      p_enforce_parent_id: null,
    })
  );

  unwrap("call", await doctor.rpc("call_visit", { p_visit_id: visit.id }));
  unwrap(
    "complete",
    await doctor.rpc("complete_visit", {
      p_visit_id: visit.id,
      p_consultation: 200,
      p_vaccination: 0,
      p_other: 0,
      p_payments: [{ mode: "cash", amount: 200 }],
    })
  );

  return visit;
}

async function main() {
  const doctor = await signIn(
    process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test",
    process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo"
  );
  const pharmacist = await signIn(
    process.env.DEMO_PHARMACIST_EMAIL ?? "pharmacist@pediclinic.test",
    process.env.DEMO_PHARMACIST_PASSWORD ?? "pedi-pharmacist-demo"
  );

  const staff = unwrap(
    "doctor staff row",
    await doctor.from("staff").select("clinic_id").single()
  );
  const clinicId = staff.clinic_id;

  // Park any consultation already open, and put it back afterwards.
  const parked = unwrap(
    "look for an open consultation",
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

  // --- stock ---------------------------------------------------------------
  const medicine = unwrap(
    "add medicine",
    await pharmacist.rpc("add_medicine", {
      p_clinic_id: clinicId,
      p_name: `Test Syrup ${Date.now()}`,
      p_unit: "bottle",
      p_unit_price: 75,
      p_initial_stock: 10,
      p_low_stock_threshold: 3,
    })
  );
  cleanups.push(() => admin.from("medicines").delete().eq("id", medicine.id));
  check("pharmacist can add stock", medicine.stock === 10);

  const doctorAdd = await doctor.rpc("add_medicine", {
    p_clinic_id: clinicId,
    p_name: "Should Not Exist",
    p_unit: "tablet",
    p_unit_price: 1,
    p_initial_stock: 1,
    p_low_stock_threshold: 1,
  });
  check("the doctor cannot manage stock", Boolean(doctorAdd.error), doctorAdd.error?.message);

  const restocked = unwrap(
    "restock",
    await pharmacist.rpc("restock_medicine", {
      p_medicine_id: medicine.id,
      p_quantity: 5,
    })
  );
  check("restocking increments rather than overwrites", restocked.stock === 15);

  // --- dispensing ----------------------------------------------------------
  const visit = await completedVisit(doctor, clinicId, "Pharmacy Test Child");

  const feed = unwrap(
    "pharmacy feed",
    await pharmacist.rpc("pharmacy_feed", { p_clinic_id: clinicId })
  );
  check(
    "a completed visit reaches the pharmacy feed",
    feed.some((row) => row.visit_id === visit.id)
  );

  const doctorDispense = await doctor.rpc("dispense_order", {
    p_visit_id: visit.id,
    p_items: [{ medicine_id: medicine.id, quantity: 1 }],
  });
  check(
    "the doctor cannot dispense",
    Boolean(doctorDispense.error),
    doctorDispense.error?.message
  );

  const tooMany = await pharmacist.rpc("dispense_order", {
    p_visit_id: visit.id,
    p_items: [{ medicine_id: medicine.id, quantity: 999 }],
  });
  check(
    "dispensing more than the stock is refused",
    Boolean(tooMany.error),
    tooMany.error?.message
  );

  const stockAfterRefusal = unwrap(
    "stock after refusal",
    await admin.from("medicines").select("stock").eq("id", medicine.id).single()
  );
  check(
    "a refused dispense changes nothing",
    stockAfterRefusal.stock === 15,
    `stock ${stockAfterRefusal.stock}`
  );

  const order = unwrap(
    "dispense",
    await pharmacist.rpc("dispense_order", {
      p_visit_id: visit.id,
      p_items: [{ medicine_id: medicine.id, quantity: 2 }],
    })
  );
  check("order marked dispensed", order.status === "dispensed");
  check("bill priced from stock", Number(order.total) === 150, `₹${order.total}`);

  const stockAfter = unwrap(
    "stock after dispense",
    await admin.from("medicines").select("stock").eq("id", medicine.id).single()
  );
  check("stock deducted", stockAfter.stock === 13, `stock ${stockAfter.stock}`);

  const feedAfter = unwrap(
    "feed after dispense",
    await pharmacist.rpc("pharmacy_feed", { p_clinic_id: clinicId })
  );
  check(
    "the dispensed visit leaves the feed",
    !feedAfter.some((row) => row.visit_id === visit.id)
  );

  // --- skip path -----------------------------------------------------------
  const skipVisit = await completedVisit(doctor, clinicId, "Buying Elsewhere Child");
  const skipped = unwrap(
    "skip order",
    await pharmacist.rpc("skip_pharmacy_order", { p_visit_id: skipVisit.id })
  );
  check("skipping clears the visit", skipped.status === "skipped");

  const feedAfterSkip = unwrap(
    "feed after skip",
    await pharmacist.rpc("pharmacy_feed", { p_clinic_id: clinicId })
  );
  check(
    "a skipped visit leaves the feed too",
    !feedAfterSkip.some((row) => row.visit_id === skipVisit.id)
  );

  // Visits cascade from the parents created in completedVisit().
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
