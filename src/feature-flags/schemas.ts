/**
 * Feature Flag Schema Registry
 *
 * All feature flags must be defined here with Zod schemas and JSDoc metadata.
 * Schemas serve dual purpose:
 * 1. Runtime validation of flag values from KV
 * 2. Type inference for compile-time type safety
 *
 * @see specs/feature-flags.md for complete documentation
 */

import { z } from 'zod';

/**
 * Flag schema registry
 *
 * Each flag MUST include JSDoc metadata:
 * - @description - What feature/behavior the flag controls
 * - @added - When flag was created (YYYY-MM-DD format)
 * - @owner - Who's responsible for the flagged feature (GitHub username)
 * - @removal - Expected date to remove flag (YYYY-MM-DD format)
 */
export const FlagSchemas = {
  /**
   * Example flag to demonstrate the feature flags system
   * @description Example boolean flag for testing and documentation
   * @added 2025-10-22
   * @owner @system
   * @removal 2026-01-22
   */
  EXAMPLE_FEATURE: z.boolean().default(false),
} as const;

/**
 * Inferred type of all flag values
 * This type is automatically derived from the schemas above
 * Flags may be undefined if no default is specified in the schema
 */
export type FlagValues = {
  [K in keyof typeof FlagSchemas]: z.infer<(typeof FlagSchemas)[K]> | undefined;
};

/**
 * Default flag values extracted from schemas
 * These serve as the lowest-priority fallback when KV and wrangler.toml are unavailable
 *
 * If a schema doesn't have a .default() clause, the flag will be undefined
 */
export const getSchemaDefaults = (): FlagValues => {
  const defaults: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(FlagSchemas)) {
    // Parse undefined to get the default value from the schema
    const result = schema.safeParse(undefined);
    if (result.success) {
      defaults[key] = result.data;
    }
    // If parse fails (no default specified), don't set any value
    // This leaves the flag as undefined
  }

  return defaults as FlagValues;
};
