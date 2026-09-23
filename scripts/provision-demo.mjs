/**
 * Provisions the minimum a demo needs: one clinic, its settings, and staff
 * logins. Idempotent — safe to re-run.
 *
 *   node --env-file=.env.local scripts/provision-demo.mjs
 *
 * Phase 9 grows this into the full seed (medicines, past visits, ratings)
 * alongside a reset script.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/provision-demo.mjs"
  );
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const clinicName = process.env.DEMO_CLINIC_NAME ?? "Pedi Clinic";
const clinicTimezone = process.env.DEMO_CLINIC_TIMEZONE ?? "Asia/Kolkata";

const staffAccounts = [
  {
    role: "doctor",
    email: process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test",
    password: process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo",
  },
  {
    role: "pharmacist",
    email: process.env.DEMO_PHARMACIST_EMAIL ?? "pharmacist@pediclinic.test",
    password: process.env.DEMO_PHARMACIST_PASSWORD ?? "pedi-pharmacist-demo",
  },
  {
    role: "owner",
    email: process.env.DEMO_OWNER_EMAIL ?? "owner@pediclinic.test",
    password: process.env.DEMO_OWNER_PASSWORD ?? "pedi-owner-demo",
  },
];

// Operational config the app reads at runtime — never hardcoded in app code.
// Reminder times are clinic-local (IST) and are placeholders to confirm with
// the clinic before launch (an open item in the brief).
const settings = {
  daily_token_limit_per_phone: Number(process.env.DEMO_DAILY_TOKEN_LIMIT ?? 3),
  booking_window_days: Number(process.env.DEMO_BOOKING_WINDOW_DAYS ?? 7),
  reminder_morning_time: process.env.DEMO_REMINDER_MORNING_TIME ?? "08:00",
  reminder_evening_time: process.env.DEMO_REMINDER_EVENING_TIME ?? "19:00",
  follow_up_reminder_days_before: Number(process.env.DEMO_FOLLOW_UP_DAYS_BEFORE ?? 2),
  // Analytics: a follow-up counts as "returned" if the child is seen again
  // within this many days after the follow-up date.
  follow_up_return_grace_days: Number(process.env.DEMO_FOLLOW_UP_GRACE_DAYS ?? 7),
};

function fail(step, error) {
  console.error(`✗ ${step}:`, error.message ?? error);
  process.exit(1);
}

async function ensureClinic() {
  const { data: existing, error } = await db
    .from("clinics")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) fail("read clinics", error);

  if (existing) {
    console.log(`• clinic already exists: ${existing.name} (${existing.id})`);
    return existing;
  }

  const { data, error: insertError } = await db
    .from("clinics")
    .insert({ name: clinicName, timezone: clinicTimezone })
    .select("*")
    .single();
  if (insertError) fail("create clinic", insertError);

  console.log(`✓ created clinic: ${data.name} (${data.id})`);
  return data;
}

async function ensureSettings(clinicId) {
  const rows = Object.entries(settings).map(([key, value]) => ({
    clinic_id: clinicId,
    key,
    value,
  }));

  const { error } = await db
    .from("settings")
    .upsert(rows, { onConflict: "clinic_id,key" });
  if (error) fail("upsert settings", error);

  console.log(`✓ settings: ${Object.keys(settings).join(", ")}`);
}

async function findUserByEmail(email) {
  // listUsers is paginated; the demo project has few users.
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail("list auth users", error);

    const match = data.users.find((user) => user.email === email);
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureStaff(clinicId, { role, email, password }) {
  let user = await findUserByEmail(email);

  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) fail(`create ${role} user`, error);
    user = data.user;
    console.log(`✓ created ${role} login: ${email}`);
  } else {
    console.log(`• ${role} login already exists: ${email}`);
  }

  const { error } = await db.from("staff").upsert(
    {
      user_id: user.id,
      // Owner is our own team, not clinic staff, so it stays clinic-independent.
      clinic_id: role === "owner" ? null : clinicId,
      role,
    },
    { onConflict: "user_id" }
  );
  if (error) fail(`link ${role} staff row`, error);
}

const clinic = await ensureClinic();
await ensureSettings(clinic.id);
for (const account of staffAccounts) {
  await ensureStaff(clinic.id, account);
}

console.log("\nDone. Staff logins:");
for (const { role, email, password } of staffAccounts) {
  console.log(`  ${role.padEnd(11)} ${email}  /  ${password}`);
}
