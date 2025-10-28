/**
 * Flag Set Assignment Functions
 *
 * Assignment functions determine which flag set to use for a given request.
 * Functions are composable and execute in order - first non-null result wins.
 *
 * @see specs/feature-flags.md for complete documentation
 */

import type { Env } from '../index';

/**
 * Assignment function signature
 * @param request - The incoming request
 * @param env - Environment bindings
 * @returns Flag set ID if matched, null to pass to next function
 */
export type FlagSetAssignmentFn = (request: Request, env: Env) => string | null;

/**
 * Default flag set ID to use when no assignment function matches
 *
 * This maps to the KV key: flagset:default
 * The KV namespace binding provides environment separation:
 * - Production worker uses production FEATURE_FLAGS_KV
 * - Development worker uses development FEATURE_FLAGS_KV
 */
export const DEFAULT_FLAG_SET_ID = 'default';

/**
 * Determine which flag set to use for the given request
 *
 * @param request - The incoming request
 * @param env - Environment bindings
 * @param assignmentFns - Optional array of assignment functions to evaluate
 * @returns Flag set ID to use
 *
 * @example
 * // Simple usage (returns "default")
 * const flagSetId = determineFlagSet(request, env);
 *
 * @example
 * // With custom assignment logic
 * const assignByTestClient: FlagSetAssignmentFn = (req) => {
 *   const userAgent = req.headers.get('user-agent');
 *   if (userAgent?.includes('TestClient')) return 'client:test';
 *   return null;
 * };
 * const flagSetId = determineFlagSet(request, env, [assignByTestClient]);
 */
export const determineFlagSet = (
  request: Request,
  env: Env,
  assignmentFns: FlagSetAssignmentFn[] = [],
): string => {
  for (const fn of assignmentFns) {
    const result = fn(request, env);
    if (result !== null) {
      return result;
    }
  }
  return DEFAULT_FLAG_SET_ID;
};
