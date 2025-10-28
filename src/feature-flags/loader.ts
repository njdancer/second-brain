/**
 * Feature Flag Loader
 *
 * Loads flag sets from KV and resolves flag values with proper default handling.
 * Flag resolution priority (highest to lowest):
 * 1. KV flag set values (runtime configuration) - Loaded from FEATURE_FLAGS_KV
 * 2. wrangler.toml environment values (build-time defaults) - FEATURE_FLAG_* env vars
 * 3. Schema defaults (hardcoded fail-safe values) - Defined in schemas.ts
 *
 * @see specs/feature-flags.md for complete documentation
 */

import type { Env } from '../index';
import { FlagSchemas, type FlagValues, getSchemaDefaults } from './schemas';
import type { Logger } from '../logger';

/**
 * Create flag set key for KV storage
 * Format: flagset:{set_id}
 *
 * Policy: Flag set IDs should follow flagset:{namespace}:{identifier} pattern
 * Exception: flagset:default is the standard default flag set
 *
 * Examples:
 * - flagset:default (our default)
 * - flagset:env:production (environment-based)
 * - flagset:user:123 (user-specific)
 * - flagset:client:claude (client-specific)
 */
const getFlagSetKey = (setId: string): string => {
  return `flagset:${setId}`;
};

/**
 * Load flag set from KV
 * @param env - Environment bindings
 * @param setId - Flag set ID to load
 * @returns Parsed flag set object or null if not found/invalid
 */
const loadFlagSetFromKV = async (
  env: Env,
  setId: string,
  logger: Logger,
): Promise<Partial<FlagValues> | null> => {
  try {
    const key = getFlagSetKey(setId);
    const value = await env.FEATURE_FLAGS_KV.get(key);

    if (!value) {
      logger.debug('Flag set not found in KV', { flagSetId: setId, key });
      return null;
    }

    // Parse JSON
    const parsed = JSON.parse(value) as Record<string, unknown>;
    logger.debug('Flag set loaded from KV', {
      flagSetId: setId,
      flagCount: Object.keys(parsed).length,
    });

    // Validate each flag against its schema
    const validated: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(FlagSchemas)) {
      if (key in parsed) {
        const result = schema.safeParse(parsed[key]);
        if (result.success) {
          validated[key] = result.data;
        } else {
          logger.warn('Flag validation failed, using default', {
            flag: key,
            error: result.error.message,
          });
        }
      }
    }

    return validated as Partial<FlagValues>;
  } catch (error) {
    logger.error(
      'Failed to load flag set from KV',
      error instanceof Error ? error : new Error(String(error)),
      { flagSetId: setId },
    );
    return null;
  }
};

/**
 * Load flag defaults from wrangler.toml environment variables
 *
 * Reads environment variables with pattern FEATURE_FLAG_{FLAG_NAME}
 * Example: FEATURE_FLAG_EXAMPLE_FEATURE="true" in wrangler.toml [vars]
 *
 * @param env - Environment bindings
 * @param logger - Logger instance
 * @returns Partial flag values from wrangler.toml
 */
const loadWranglerDefaults = (env: Env, logger: Logger): Partial<FlagValues> => {
  const defaults: Record<string, unknown> = {};
  const envRecord = env as unknown as Record<string, unknown>;

  for (const [key, schema] of Object.entries(FlagSchemas)) {
    const envKey = `FEATURE_FLAG_${key}`;
    if (envKey in envRecord) {
      const rawValue = envRecord[envKey];
      const result = schema.safeParse(rawValue);
      if (result.success) {
        defaults[key] = result.data;
        logger.debug('Loaded flag from wrangler.toml', {
          flag: key,
          value: result.data,
        });
      } else {
        logger.warn('Invalid flag value in wrangler.toml', {
          flag: key,
          envKey,
          error: result.error.message,
        });
      }
    }
  }

  return defaults as Partial<FlagValues>;
};

/**
 * Merge flag values with priority: KV > wrangler.toml > schema defaults
 * @param kvFlags - Flags loaded from KV (may be partial)
 * @param wranglerFlags - Flags from wrangler.toml env vars (may be partial)
 * @param schemaDefaults - Default values from schemas
 * @returns Complete flag set with all flags defined
 */
const mergeFlagValues = (
  kvFlags: Partial<FlagValues> | null,
  wranglerFlags: Partial<FlagValues>,
  schemaDefaults: FlagValues,
): FlagValues => {
  // Start with schema defaults (lowest priority)
  const merged = { ...schemaDefaults };

  // Override with wrangler.toml values (middle priority)
  for (const [key, value] of Object.entries(wranglerFlags)) {
    if (key in merged) {
      merged[key as keyof FlagValues] = value;
    }
  }

  // Override with KV values (highest priority)
  if (kvFlags) {
    for (const [key, value] of Object.entries(kvFlags)) {
      if (key in merged) {
        merged[key as keyof FlagValues] = value;
      }
    }
  }

  return merged;
};

/**
 * Load flags for a request
 * @param env - Environment bindings
 * @param flagSetId - Flag set ID to load
 * @param logger - Logger instance for this request
 * @returns Complete flag set with all flags resolved
 */
export const loadFlags = async (
  env: Env,
  flagSetId: string,
  logger: Logger,
): Promise<FlagValues> => {
  logger.debug('Loading flags', { flagSetId });

  // Get schema defaults (fail-safe fallback, lowest priority)
  const schemaDefaults = getSchemaDefaults();

  // Load wrangler.toml defaults (middle priority)
  const wranglerFlags = loadWranglerDefaults(env, logger);

  // Load flag set from KV (highest priority)
  const kvFlags = await loadFlagSetFromKV(env, flagSetId, logger);

  // Merge with priority: KV > wrangler.toml > schema defaults
  const flags = mergeFlagValues(kvFlags, wranglerFlags, schemaDefaults);

  logger.debug('Flags loaded', { flagSetId, flags });

  return flags;
};

/**
 * Flag context for a single request
 * Caches flag values to avoid multiple KV reads per request
 */
export class FlagContext {
  private flags: FlagValues | null = null;

  constructor(
    private env: Env,
    private flagSetId: string,
    private logger: Logger,
  ) {}

  /**
   * Get flag values (loads once per request, then caches)
   */
  async getFlags(): Promise<FlagValues> {
    if (this.flags === null) {
      this.flags = await loadFlags(this.env, this.flagSetId, this.logger);
    }
    return this.flags;
  }

  /**
   * Get a specific flag value
   */
  async getFlag<K extends keyof FlagValues>(key: K): Promise<FlagValues[K]> {
    const flags = await this.getFlags();
    return flags[key];
  }
}
