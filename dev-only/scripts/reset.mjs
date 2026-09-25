/**
 * Clears all clinic data — parents (and their logins), children, visits,
 * appointments, sessions, medicines, pharmacy orders, ratings, notifications,
 * installs, and prescription photos — keeping the clinic, its settings, and
 * the staff logins, so the app is ready for a fresh start or a seed.
 *
 *   node --env-file=.env.local scripts/reset.mjs          # dry run: shows what would go
 *   node --env-file=.env.local scripts/reset.mjs --yes    # actually deletes
 *
 * Irreversible. Needs the service-role key; the database side
 * (`reset_clinic_data`) cannot be called by any signed-in user.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Run with: node --env-file=.env.local scripts/reset.mjs [--yes]");
  process.exit(1);
}

const confirmed = process.argv.includes("--yes");
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  "parents",
  "children",
  "visits",
  "appointments",
  "availability_sessions",
  "medicines",
  "pharmacy_orders",
  "ratings",
  "notifications",
  "push_subscriptions",
  "installs",
];
const BUCKET = "prescriptions";

function unwrap(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}

/** Every object path in the bucket; photos are stored as `<visitId>/<file>`. */
async function listPhotos() {
  const paths = [];
  const folders = unwrap("list photos", await admin.storage.from(BUCKET).list("", { limit: 10000 }));
  for (const entry of folders) {
    if (entry.id) {
      paths.push(entry.name);
      continue;
    }
    const files = unwrap(
      `list ${entry.name}`,
      await admin.storage.from(BUCKET).list(entry.name, { limit: 1000 })
    );
    for (const file of files) paths.push(`${entry.name}/${file.name}`);
  }
  return paths;
}

/** Parent logins: every auth user who isn't staff. */
async function listParentUsers() {
  const staff = unwrap("staff", await admin.from("staff").select("user_id"));
  const staffIds = new Set(staff.map((row) => row.user_id));
  const users = [];
  for (let page = 1; ; page += 1) {
    const { users: batch } = unwrap(
      "list users",
      await admin.auth.admin.listUsers({ page, perPage: 1000 })
    );
    users.push(...batch.filter((user) => !staffIds.has(user.id)));
    if (batch.length < 1000) break;
  }
  return users;
}

async function main() {
  console.log(`Project: ${url}`);

  const counts = {};
  for (const table of TABLES) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count;
  }
  const photos = await listPhotos();
  const parentUsers = await listParentUsers();

  console.table({
    ...counts,
    "prescription photos": photos.length,
    "parent logins": parentUsers.length,
  });
  console.log("Kept: clinics, settings, staff logins.");

  if (!confirmed) {
    console.log("\nDry run — nothing deleted. Re-run with --yes to delete the above.");
    return;
  }

  unwrap("reset tables", await admin.rpc("reset_clinic_data"));
  console.log("✓ cleared clinic data");

  for (let i = 0; i < photos.length; i += 100) {
    unwrap("delete photos", await admin.storage.from(BUCKET).remove(photos.slice(i, i + 100)));
  }
  console.log(`✓ removed ${photos.length} prescription photo(s)`);

  for (const user of parentUsers) {
    unwrap(`delete ${user.phone || user.email}`, await admin.auth.admin.deleteUser(user.id));
  }
  console.log(`✓ removed ${parentUsers.length} parent login(s)`);
}

try {
  await main();
} catch (error) {
  console.error("✗", error.message);
  process.exit(1);
}
