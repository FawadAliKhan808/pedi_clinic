/**
 * Proves the two race-sensitive operations are safe under concurrent callers
 * (brief §3): token assignment hands out no duplicate numbers, and dispensing
 * cannot oversell stock.
 *
 *   node --env-file=.env.local scripts/test-concurrency.mjs
 *
 * Creates its own throwaway data and deletes it again.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/test-concurrency.mjs");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CONCURRENT_CHILDREN = 25;
const testPhone = `test-concurrency-${Date.now()}`;
const medicinesToDelete = [];

let failures = 0;

function check(description, passed, detail) {
  console.log(`${passed ? "✓" : "✗"} ${description}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function must(step, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(`✗ ${step}:`, error.message);
    process.exit(1);
  }
  return data;
}

const clinic = await must(
  "read clinic",
  db.from("clinics").select("id").order("created_at").limit(1).single()
);

const parent = await must(
  "create test parent",
  db.from("parents").insert({ phone: testPhone }).select("id").single()
);

const children = await must(
  "create test children",
  db
    .from("children")
    .insert(
      Array.from({ length: CONCURRENT_CHILDREN }, (_, index) => ({
        parent_id: parent.id,
        name: `Concurrency Test ${index + 1}`,
        dob: "2020-01-01",
      }))
    )
    .select("id")
);

async function assignToken(childId) {
  return db.rpc("assign_token", {
    p_clinic_id: clinic.id,
    p_child_id: childId,
    p_visit_reason: "general_checkup",
    p_appointment_id: null,
    p_enforce_parent_id: null,
  });
}

/**
 * Eight parents' taps on "Book" landing at once for a session with three
 * slots. book_appointment locks the session row before counting, so exactly
 * three succeed and the rest get SESSION_FULL.
 */
async function testBookingRace() {
  const SLOTS = 3;
  const ATTEMPTS = 8;

  const parentClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const phone = process.env.DEMO_TEST_PHONE ?? "8088509302";
  await parentClient.auth.signInWithOtp({ phone });
  await must(
    "parent OTP verify",
    parentClient.auth.verifyOtp({
      phone,
      token: process.env.DEMO_TEST_OTP ?? "123456",
      type: "sms",
    })
  );
  const bookingParent = await must(
    "booking parent",
    parentClient.rpc("upsert_parent_profile", { p_name: null })
  );

  const [window] = await must("booking window", parentClient.rpc("booking_window"));
  const tomorrow = new Date(`${window.today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const session = await must(
    "create session",
    db
      .from("availability_sessions")
      .insert({
        clinic_id: clinic.id,
        date: tomorrow.toISOString().slice(0, 10),
        start_time: "09:00",
        end_time: "10:00",
        max_bookings: SLOTS,
      })
      .select("id")
      .single()
  );

  const racers = await must(
    "create booking children",
    db
      .from("children")
      .insert(
        Array.from({ length: ATTEMPTS }, (_, index) => ({
          parent_id: bookingParent.id,
          name: `Booking Race ${index + 1}`,
          dob: "2021-01-01",
        }))
      )
      .select("id")
  );

  try {
    const attempts = await Promise.all(
      racers.map((child) =>
        parentClient.rpc("book_appointment", {
          p_session_id: session.id,
          p_child_id: child.id,
        })
      )
    );

    const booked = attempts.filter((result) => !result.error);
    const full = attempts.filter((result) => result.error?.message.includes("SESSION_FULL"));
    const { count } = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      // New bookings are requests awaiting approval; they still hold their slot.
      .eq("status", "pending");

    check(
      `only ${SLOTS} of ${ATTEMPTS} concurrent bookings succeed`,
      booked.length === SLOTS && full.length === ATTEMPTS - SLOTS,
      `${booked.length} booked, ${full.length} full`
    );
    check("a session is never overbooked", count === SLOTS, `${count} bookings stored`);

    // Approve and reject landing on the same request at the same instant.
    const doctorClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await must(
      "doctor sign-in",
      doctorClient.auth.signInWithPassword({
        email: process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test",
        password: process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo",
      })
    );
    const contested = booked[0].data.id;
    const decisions = await Promise.all([
      doctorClient.rpc("decide_appointment", { p_appointment_id: contested, p_approve: true }),
      doctorClient.rpc("decide_appointment", { p_appointment_id: contested, p_approve: false }),
    ]);
    const decided = decisions.filter((result) => !result.error);
    check(
      "two simultaneous decisions on one request: exactly one wins",
      decided.length === 1,
      `${decided.length} succeeded, then status ${decided[0]?.data?.status}`
    );
  } finally {
    await db.from("availability_sessions").delete().eq("id", session.id);
    await db.from("children").delete().in("id", racers.map((child) => child.id));
  }
}

/**
 * Eight pharmacists hitting Dispense at once against stock that covers only
 * five of them. The prototype's read-then-write would let stock go negative;
 * dispense_order locks each medicine row, so exactly five can succeed.
 */
async function testDispenseRace() {
  const STOCK = 5;
  const ATTEMPTS = 8;

  const pharmacist = await must(
    "sign in as pharmacist",
    createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({
      email: process.env.DEMO_PHARMACIST_EMAIL ?? "pharmacist@pediclinic.test",
      password: process.env.DEMO_PHARMACIST_PASSWORD ?? "pedi-pharmacist-demo",
    })
  );
  const pharmacistClient = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  await pharmacistClient.auth.setSession(pharmacist.session);

  const medicine = await must(
    "create test medicine",
    db
      .from("medicines")
      .insert({
        clinic_id: clinic.id,
        name: `Concurrency Syrup ${Date.now()}`,
        unit: "bottle",
        unit_price: 40,
        stock: STOCK,
        low_stock_threshold: 0,
      })
      .select("id")
      .single()
  );

  // One pending order per competing attempt.
  const raceChildren = await must(
    "create dispense-test children",
    db
      .from("children")
      .insert(
        Array.from({ length: ATTEMPTS }, (_, index) => ({
          parent_id: parent.id,
          name: `Dispense Test ${index + 1}`,
          dob: "2020-01-01",
        }))
      )
      .select("id")
  );

  const orders = [];
  for (const child of raceChildren) {
    const { data: visit } = await assignToken(child.id);
    await db.from("visits").update({ status: "completed" }).eq("id", visit.id);
    const { data: order } = await db
      .from("pharmacy_orders")
      .insert({ visit_id: visit.id, clinic_id: clinic.id })
      .select("visit_id")
      .single();
    orders.push(order);
  }

  const attempts = await Promise.all(
    orders.map((order) =>
      pharmacistClient.rpc("dispense_order", {
        p_visit_id: order.visit_id,
        p_items: [{ medicine_id: medicine.id, quantity: 1 }],
      })
    )
  );

  const filled = attempts.filter((result) => !result.error);
  const refused = attempts.filter((result) => result.error);

  const { data: after } = await db
    .from("medicines")
    .select("stock")
    .eq("id", medicine.id)
    .single();

  check(
    `only ${STOCK} of ${ATTEMPTS} concurrent dispenses succeed`,
    filled.length === STOCK && refused.length === ATTEMPTS - STOCK,
    `${filled.length} filled, ${refused.length} refused`
  );
  check("stock is never oversold", after.stock === 0, `stock left: ${after.stock}`);
  check(
    "refusals name the medicine that ran out",
    refused.every((result) => result.error.message.includes("INSUFFICIENT_STOCK")),
    refused[0]?.error.message
  );

  // order_items reference the medicine, so it can only go once the orders do.
  medicinesToDelete.push(medicine.id);
}

try {
  // 1. Many different children checking in at the same instant.
  const results = await Promise.all(children.map((child) => assignToken(child.id)));

  const errored = results.filter((result) => result.error);
  check(
    `${CONCURRENT_CHILDREN} concurrent check-ins all succeeded`,
    errored.length === 0,
    errored.length ? errored[0].error.message : undefined
  );

  const seqs = results.filter((r) => r.data).map((r) => r.data.seq);
  const unique = new Set(seqs);
  check(
    "every token number is unique",
    unique.size === seqs.length,
    `${seqs.length} tokens, ${unique.size} distinct`
  );
  check(
    "token numbers are contiguous",
    seqs.length > 0 &&
      Math.max(...seqs) - Math.min(...seqs) === seqs.length - 1,
    `${Math.min(...seqs)}..${Math.max(...seqs)}`
  );

  // 2. The same child, with no token yet, checking in twice at the same instant.
  const raceChild = await must(
    "create race-test child",
    db
      .from("children")
      .insert({ parent_id: parent.id, name: "Race Test", dob: "2020-01-01" })
      .select("id")
      .single()
  );

  const raceAttempts = await Promise.all([
    assignToken(raceChild.id),
    assignToken(raceChild.id),
  ]);
  const succeeded = raceAttempts.filter((result) => !result.error);
  const rejected = raceAttempts.filter((result) => result.error);
  check(
    "two simultaneous check-ins for one child yield exactly one token",
    succeeded.length === 1 && rejected.length === 1,
    `${succeeded.length} succeeded, ${rejected.length} rejected (${rejected[0]?.error.message})`
  );

  // 3. Dispensing: eight simultaneous orders against stock that only covers five.
  await testDispenseRace();

  // 4. Booking: eight simultaneous bookings for a session with three slots.
  await testBookingRace();
} finally {
  // children/visits/orders cascade from the parent row; medicines can only go
  // once the order_items referencing them are gone.
  await db.from("parents").delete().eq("id", parent.id);
  for (const medicineId of medicinesToDelete) {
    const { error } = await db.from("medicines").delete().eq("id", medicineId);
    if (error) console.error("  could not remove test medicine:", error.message);
  }
  console.log("• cleaned up test data");
}

process.exit(failures === 0 ? 0 : 1);
