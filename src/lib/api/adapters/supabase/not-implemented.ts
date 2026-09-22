import { ApiError } from "../../types";

/**
 * Placeholder for an `Api` domain interface whose backing tables/DB
 * functions don't exist yet. Satisfies the interface at compile time; any
 * method call throws a clear error at runtime pointing at the build phase
 * that will replace it. Remove once the real adapter for that domain lands.
 */
export function notImplementedApi<T extends object>(domainName: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      return () => {
        throw new ApiError(
          `${domainName}.${String(prop)}() is not implemented yet.`,
          "NOT_IMPLEMENTED"
        );
      };
    },
  });
}
