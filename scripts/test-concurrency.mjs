/**
 * Proves the token assignment in `assign_token` is safe under concurrent
 * callers (brief §3): no duplicate token numbers, and no second active token
 * for the same child.
 *
 *   node --env-file=.env.local scripts/test-concurrency.mjs
 *
 * Creates its own throwaway parent/children/visits and deletes them again.
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
} finally {
  // children/visits cascade from the parent row.
  await db.from("parents").delete().eq("id", parent.id);
  console.log("• cleaned up test data");
}

process.exit(failures === 0 ? 0 : 1);
