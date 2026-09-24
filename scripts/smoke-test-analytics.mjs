/**
 * End-to-end check of the Phase 8 analytics against the live project:
 *
 *   role gates (doctor-only analytics, owner-only overview) → range checks →
 *   a completed visit, a removed walk-in, and a rating move every number by
 *   exactly what they should
 *
 *   node --env-file=.env.local scripts/smoke-test-analytics.mjs
 *
 * Compares before/after snapshots, so existing data doesn't matter. Creates
 * only its own data and removes it, restoring any consultation it parked.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/smoke-test-analytics.mjs");
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

function forbidden(result) {
  return Boolean(result.error) && /FORBIDDEN|permission denied/i.test(result.error.message);
}

const todayRow = (analytics, today) => analytics.daily.find((day) => day.date === today);

async function main() {
  const doctor = await signIn(
    process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test",
    process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo"
  );
  const pharmacist = await signIn(
    process.env.DEMO_PHARMACIST_EMAIL ?? "pharmacist@pediclinic.test",
    process.env.DEMO_PHARMACIST_PASSWORD ?? "pedi-pharmacist-demo"
  );
  const owner = await signIn(
    process.env.DEMO_OWNER_EMAIL ?? "owner@pediclinic.test",
    process.env.DEMO_OWNER_PASSWORD ?? "pedi-owner-demo"
  );

  const { clinic_id: clinicId } = unwrap(
    "doctor staff row",
    await doctor.from("staff").select("clinic_id").single()
  );
  const today = unwrap("clinic today", await admin.rpc("clinic_today", { p_clinic_id: clinicId }));
  const range = { p_clinic_id: clinicId, p_from: today, p_to: today };
  const day = { p_clinic_id: clinicId, p_date: today };

  // --- role gates -----------------------------------------------------------
  check("pharmacist cannot read doctor analytics", forbidden(await pharmacist.rpc("doctor_analytics", range)));
  check("pharmacist cannot read the end-of-day summary", forbidden(await pharmacist.rpc("end_of_day_summary", day)));
  check("owner cannot read clinic analytics", forbidden(await owner.rpc("doctor_analytics", range)));
  check("signed-out callers cannot read analytics", forbidden(await newClient().rpc("doctor_analytics", range)));
  check("doctor cannot read the owner overview", forbidden(await doctor.rpc("owner_overview")));
  check("pharmacist cannot read the owner overview", forbidden(await pharmacist.rpc("owner_overview")));
  check("signed-out callers cannot read the owner overview", forbidden(await newClient().rpc("owner_overview")));

  // --- ranges ---------------------------------------------------------------
  const reversed = await doctor.rpc("doctor_analytics", { ...range, p_to: "2000-01-01" });
  check("a reversed range is refused", /INVALID_RANGE/.test(reversed.error?.message ?? ""));
  const tooLong = await doctor.rpc("doctor_analytics", { ...range, p_from: "2020-01-01" });
  check("a range over a year is refused", /INVALID_RANGE/.test(tooLong.error?.message ?? ""));

  const week = unwrap(
    "7-day analytics",
    await doctor.rpc("doctor_analytics", { ...range, p_from: "2026-09-01", p_to: "2026-09-07" })
  );
  check(
    "every day in the range is present, zero-filled",
    week.daily.length === 7 && week.daily[0].date === "2026-09-01" && week.daily[6].date === "2026-09-07",
    `${week.daily.length} rows`
  );

  // Park any consultation already open (only one may be open), restore later.
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

  // --- snapshots before -----------------------------------------------------
  const before = unwrap("analytics before", await doctor.rpc("doctor_analytics", range));
  const eodBefore = unwrap("summary before", await doctor.rpc("end_of_day_summary", day));
  const ownerBefore = unwrap("owner before", await owner.rpc("owner_overview"));

  // --- activity -------------------------------------------------------------
  const stamp = Date.now();
  // Registered first so it's removed last, after the order that uses it.
  const medicine = unwrap(
    "test medicine",
    await pharmacist.rpc("add_medicine", {
      p_clinic_id: clinicId,
      p_name: `Analytics Syrup ${stamp}`,
      p_unit: "bottle",
      p_unit_price: 75,
      p_initial_stock: 10,
      p_low_stock_threshold: 1,
    })
  );
  cleanups.push(() => admin.from("medicines").delete().eq("id", medicine.id));

  const parent = unwrap(
    "test parent",
    await admin
      .from("parents")
      .insert({ phone: `analytics-test-${stamp}`, name: "Analytics Test Parent" })
      .select("id")
      .single()
  );
  cleanups.push(() => admin.from("parents").delete().eq("id", parent.id));
  const child = unwrap(
    "test child",
    await admin
      .from("children")
      .insert({ parent_id: parent.id, name: "Analytics Test Child", dob: "2023-03-01" })
      .select("id")
      .single()
  );

  const visit = unwrap(
    "app token",
    await admin.rpc("assign_token", {
      p_clinic_id: clinicId,
      p_child_id: child.id,
      p_visit_reason: "vaccination",
      p_appointment_id: null,
      p_enforce_parent_id: null,
    })
  );
  const queueRow = unwrap("doctor queue", await doctor.rpc("doctor_queue", { p_clinic_id: clinicId }))
    .find((row) => row.visit_id === visit.id);
  check(
    "the doctor's queue shows the parent's name with their phone",
    queueRow?.parent_name === "Analytics Test Parent" && Boolean(queueRow?.parent_phone)
  );

  unwrap("call", await doctor.rpc("call_visit", { p_visit_id: visit.id }));
  const started = unwrap("start", await doctor.rpc("start_consultation", { p_visit_id: visit.id }));
  check("starting a consultation records when it began", Boolean(started.consultation_started_at));
  unwrap(
    "complete",
    await doctor.rpc("complete_visit", {
      p_visit_id: visit.id,
      p_consultation: 200,
      p_vaccination: 300,
      p_other: 0,
      p_payments: [
        { mode: "cash", amount: 300 },
        { mode: "upi", amount: 200 },
      ],
    })
  );
  unwrap(
    "dispense",
    await pharmacist.rpc("dispense_order", {
      p_visit_id: visit.id,
      p_items: [{ medicine_id: medicine.id, quantity: 2 }],
    })
  );
  unwrap(
    "rating",
    await admin.from("ratings").insert({ visit_id: visit.id, parent_id: parent.id, stars: 5 })
  );

  // --- patient history ------------------------------------------------------
  const timeline = unwrap(
    "child timeline",
    await doctor.rpc("child_visit_timeline", { p_child_id: child.id })
  );
  const entry = timeline.find((row) => row.visit_id === visit.id);
  check(
    "patient history: the visit shows its fees, payments and reason",
    entry?.reason === "vaccination" &&
      Number(entry.consultation) === 200 &&
      Number(entry.vaccination) === 300 &&
      entry.payments.length === 2 &&
      entry.payments.some((pay) => pay.mode === "cash" && Number(pay.amount) === 300)
  );
  check(
    "patient history: …and what the pharmacy dispensed",
    entry?.pharmacy_status === "dispensed" &&
      Number(entry.pharmacy_total) === 150 &&
      entry.medicines.length === 1 &&
      entry.medicines[0].quantity === 2
  );
  const onDay = unwrap(
    "patients today",
    await doctor.rpc("clinic_patients_on", { p_clinic_id: clinicId, p_date: today })
  );
  check(
    "patient history: today's list includes the child, with the parent's name",
    onDay.some(
      (row) => row.visit_id === visit.id && row.parent_name === "Analytics Test Parent"
    )
  );
  const byParent = unwrap(
    "search by parent name",
    await doctor.rpc("search_children", { p_clinic_id: clinicId, p_query: "analytics test par" })
  );
  check(
    "patient history: search finds a child by the parent's name",
    byParent.some((row) => row.child_id === child.id)
  );
  check(
    "patient history is the doctor's only",
    unwrap(
      "pharmacist timeline",
      await pharmacist.rpc("child_visit_timeline", { p_child_id: child.id })
    ).length === 0 &&
      unwrap(
        "pharmacist day",
        await pharmacist.rpc("clinic_patients_on", { p_clinic_id: clinicId, p_date: today })
      ).length === 0
  );

  const walkInPhone = `analytics-walk-in-${stamp}`;
  cleanups.push(() => admin.from("parents").delete().eq("phone", walkInPhone));
  const walkIn = unwrap(
    "walk-in",
    await doctor.rpc("add_walk_in", {
      p_clinic_id: clinicId,
      p_child_name: "Analytics Walk-in Child",
      p_child_dob: "2022-06-01",
      p_parent_phone: walkInPhone,
      p_visit_reason: "general_checkup",
    })
  );
  check("walk-ins are tagged as such", walkIn.source === "walk_in", walkIn.source);
  check("app tokens are tagged as such", visit.source === "app", visit.source);
  unwrap("remove walk-in", await doctor.rpc("remove_visit", { p_visit_id: walkIn.id }));

  // --- snapshots after ------------------------------------------------------
  const after = unwrap("analytics after", await doctor.rpc("doctor_analytics", range));
  const eodAfter = unwrap("summary after", await doctor.rpc("end_of_day_summary", day));
  const ownerAfter = unwrap("owner after", await owner.rpc("owner_overview"));

  const d0 = todayRow(before, today);
  const d1 = todayRow(after, today);
  const delta = (key) => Number(d1[key]) - Number(d0[key]);
  check("patients +1", delta("patients") === 1, String(delta("patients")));
  check(
    "fee-type revenue moves by the fees",
    delta("consultation") === 200 && delta("vaccination") === 300 && delta("other") === 0
  );
  check(
    "payment-mode revenue moves by the payments",
    delta("cash") === 300 && delta("upi") === 200 && delta("card") === 0
  );
  check(
    "pharmacy sales count on the day they're dispensed",
    delta("pharmacy") === 150 && delta("pharmacy_orders") === 1,
    `${delta("pharmacy")} over ${delta("pharmacy_orders")} order(s)`
  );
  check("visit reason counted", after.visit_reasons.vaccination - before.visit_reasons.vaccination === 1);
  check("a first visit counts as new", after.new_vs_returning.new - before.new_vs_returning.new === 1);
  check("tokens total +2", after.tokens.total - before.tokens.total === 2);
  check("removed tokens +1", after.tokens.removed - before.tokens.removed === 1);
  check(
    "a removed token is left out of the same-day vs appointment split",
    after.walk_ins_vs_appointments.walk_ins - before.walk_ins_vs_appointments.walk_ins === 1 &&
      after.walk_ins_vs_appointments.appointments === before.walk_ins_vs_appointments.appointments
  );
  check(
    "average consultation time is reported",
    after.average_consultation_minutes !== null,
    String(after.average_consultation_minutes)
  );
  const hours = (a) => a.check_in_hours.reduce((sum, h) => sum + h.count, 0);
  check("check-in hours cover every token", hours(after) === after.tokens.total);

  check("end of day: patients seen +1", eodAfter.patients_seen - eodBefore.patients_seen === 1);
  check(
    "end of day: by mode",
    eodAfter.by_mode.cash - eodBefore.by_mode.cash === 300 &&
      eodAfter.by_mode.upi - eodBefore.by_mode.upi === 200
  );
  check(
    "end of day: by fee type",
    eodAfter.by_fee_type.consultation - eodBefore.by_fee_type.consultation === 200 &&
      eodAfter.by_fee_type.vaccination - eodBefore.by_fee_type.vaccination === 300
  );

  check(
    "end of day: pharmacy sales",
    Number(eodAfter.pharmacy.total) - Number(eodBefore.pharmacy.total) === 150 &&
      eodAfter.pharmacy.orders - eodBefore.pharmacy.orders === 1
  );

  check("owner: ratings +1", ownerAfter.ratings.count - ownerBefore.ratings.count === 1);
  check(
    "owner: five-star bucket +1",
    ownerAfter.ratings.distribution["5"] - ownerBefore.ratings.distribution["5"] === 1
  );
  check("owner: app tokens +1", ownerAfter.usage.app_tokens - ownerBefore.usage.app_tokens === 1);
  check("owner: walk-ins +1", ownerAfter.usage.walk_ins - ownerBefore.usage.walk_ins === 1);
  check(
    "owner: parents without an account aren't counted as registered",
    ownerAfter.adoption.parents_registered === ownerBefore.adoption.parents_registered
  );

  // Visits, fees, payments, and the rating cascade from the parents.
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
