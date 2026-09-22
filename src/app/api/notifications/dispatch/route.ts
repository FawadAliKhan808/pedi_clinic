import { timingSafeEqual } from "node:crypto";
import { dispatchPendingNotifications, getServerApi } from "@/lib/api/server";

/**
 * Pushes notifications that are waiting to go out. Two kinds of caller:
 *   - a signed-in user's browser, right after an action that moved the queue;
 *   - a scheduled job, holding NOTIFICATIONS_DISPATCH_SECRET.
 * Either way it only delivers notifications that already exist, to the users
 * they were written for — calling it can make a push arrive sooner, nothing
 * more.
 */
export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await dispatchPendingNotifications();
    return Response.json(result);
  } catch (error) {
    console.error("Notification dispatch failed", error);
    return Response.json({ error: "DISPATCH_FAILED" }, { status: 500 });
  }
}

async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.NOTIFICATIONS_DISPATCH_SECRET;
  const header = request.headers.get("authorization");

  if (secret && header?.startsWith("Bearer ")) {
    const presented = Buffer.from(header.slice("Bearer ".length));
    const expected = Buffer.from(secret);
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  const api = await getServerApi();
  return (await api.auth.getCurrentUserId()) !== null;
}
