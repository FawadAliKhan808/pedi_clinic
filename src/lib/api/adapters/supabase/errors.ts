import { ApiError } from "../../types";

/**
 * Database functions raise bare SCREAMING_SNAKE codes (`SESSION_IN_PAST`,
 * `ACTIVE_CONSULTATION_EXISTS`, ...) so the UI can branch on a stable code
 * rather than parse prose. Anything else keeps the caller's fallback code.
 */
export function toApiError(
  error: { message: string } | null,
  fallbackCode: string
): ApiError {
  const message = error?.message ?? "Request failed";
  const raised = /\b([A-Z][A-Z0-9_]{3,})\b/.exec(message);

  return new ApiError(message, raised ? raised[1] : fallbackCode, error);
}
