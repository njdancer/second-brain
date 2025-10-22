/**
 * Feature Flags System
 *
 * Runtime feature toggle system enabling controlled rollout of incomplete or experimental features.
 *
 * Usage:
 * ```typescript
 * import { createFlagContext } from './feature-flags';
 *
 * const flagContext = createFlagContext(request, env, logger);
 * const flags = await flagContext.getFlags();
 *
 * if (flags.EXAMPLE_FEATURE) {
 *   // New code path
 * } else {
 *   // Original code path
 * }
 * ```
 *
 * @see specs/feature-flags.md for complete documentation
 */

import type { Env } from '../index';
import type { Logger } from '../logger';
import { determineFlagSet } from './assignment';
import { FlagContext } from './loader';

// Re-export types for convenience
export type { FlagValues } from './schemas';
export type { FlagSetAssignmentFn } from './assignment';
export { FlagContext } from './loader';

/**
 * Create a flag context for a request
 *
 * The flag context handles flag loading and caching for a single request.
 * It performs one KV read when first accessed, then caches the results.
 *
 * @param request - The incoming request
 * @param env - Environment bindings
 * @param logger - Logger instance for this request
 * @returns Flag context for accessing flags
 */
export const createFlagContext = (
  request: Request,
  env: Env,
  logger: Logger,
): FlagContext => {
  // Determine which flag set to use for this request
  const flagSetId = determineFlagSet(request, env);

  // Create flag context with the determined flag set
  return new FlagContext(env, flagSetId, logger);
};
