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
export type FlagSetAssignmentFn = (
  request: Request,
  env: Env,
) => string | null;

/**
 * Assign flag set based on environment
 * Returns 'development' or 'production' based on the worker name
 */
export const assignByEnvironment: FlagSetAssignmentFn = (
  _request: Request,
  _env: Env,
): string | null => {
  // Check if we're in development environment
  // Development workers typically have '-dev' suffix in their name
  // We can detect this via the environment or via a custom header

  // For now, we'll use a simple heuristic:
  // If the request URL contains '-dev', we're in development
  // This works for Cloudflare Workers with dev/prod environments

  // However, we don't have direct access to the worker name in the Env
  // So we'll use an environment variable approach
  // The deployment workflow should set this appropriately

  // For initial implementation, default to 'production'
  // This can be enhanced later with proper environment detection
  return 'production';
};

/**
 * Default flag set ID to use when no assignment function matches
 */
export const DEFAULT_FLAG_SET_ID = 'production';

/**
 * Registered assignment functions in priority order (most specific to least specific)
 * Functions are evaluated in order, first non-null result is used
 */
export const ASSIGNMENT_FUNCTIONS: FlagSetAssignmentFn[] = [
  assignByEnvironment,
  // Future: assignByTestClient,
  // Future: assignByHeader,
];

/**
 * Determine which flag set to use for the given request
 * @param request - The incoming request
 * @param env - Environment bindings
 * @returns Flag set ID to use
 */
export const determineFlagSet = (request: Request, env: Env): string => {
  for (const fn of ASSIGNMENT_FUNCTIONS) {
    const result = fn(request, env);
    if (result !== null) {
      return result;
    }
  }
  return DEFAULT_FLAG_SET_ID;
};
