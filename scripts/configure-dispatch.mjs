/**
 * Tells the database's scheduled jobs where to send "please push now" once the
 * app is deployed. Stores the URL and secret in Supabase Vault — never in a
 * migration or in the readable `settings` table.
 *
 *   APP_URL=https://your-app.vercel.app npm run configure:dispatch
 *
 * The secret must match NOTIFICATIONS_DISPATCH_SECRET in the deployed app.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL;
const secret = process.env.NOTIFICATIONS_DISPATCH_SECRET;

if (!url || !serviceRoleKey || !secret) {
  console.error("Run with: APP_URL=https://… node --env-file=.env.local scripts/configure-dispatch.mjs");
  process.exit(1);
}
if (!appUrl?.startsWith("https://")) {
  console.error("APP_URL must be the deployed https:// address (the database can't reach localhost).");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await db.rpc("configure_notification_dispatch", {
  p_url: appUrl,
  p_secret: secret,
});

if (error) {
  console.error("✗", error.message);
  process.exit(1);
}
console.log(`✓ scheduled jobs will trigger push delivery at ${appUrl}/api/notifications/dispatch`);
