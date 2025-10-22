/**
 * Runtime version information
 *
 * These values are replaced at build time by the deployment workflow.
 * In development, they show placeholder values.
 */

export const VERSION_INFO = {
  /** Version tag (e.g., "25.1.0") */
  version: '__VERSION__',

  /** Full commit SHA */
  commit: '__COMMIT_SHA__',

  /** Build timestamp (ISO 8601) */
  buildTime: '__BUILD_TIME__',

  /** Environment (development or production) */
  environment: '__ENVIRONMENT__',
} as const;

/**
 * Get formatted version string for display
 * @returns Version string like "25.1.0 (abc123d)" or "dev" for development
 */
export function getVersionString(): string {
  if (VERSION_INFO.version === '__VERSION__') {
    return 'dev';
  }

  const shortCommit = VERSION_INFO.commit.substring(0, 7);
  return `${VERSION_INFO.version} (${shortCommit})`;
}

/**
 * Check if running in development mode
 * @returns true if version placeholders are not replaced
 */
export function isDevelopment(): boolean {
  return VERSION_INFO.version === '__VERSION__';
}
