# Feature Flags

Runtime feature toggle system enabling controlled rollout of incomplete or experimental features.

---

## Overview

The feature flag system enables merging incomplete or experimental work to `main` without requiring long-lived feature branches. Flags can be toggled at runtime without redeployment, providing quick rollback capabilities and environment-specific behavior.

**Design Principles:**
- **Simple now, extensible later:** Start with environment-based flags, extend to more complex targeting as needed
- **Performance-first:** Single KV read per request for all flags (flag sets approach)
- **Type-safe:** Zod schema validation for all flag values
- **Prevent tech debt:** Registry-based tracking with manual cleanup process

---

## Architecture

### Flag Sets

Flags are organized into **flag sets** stored as JSON objects in Cloudflare KV. Each flag set defines values for multiple flags, minimizing KV reads.

**Flag set structure:**
```typescript
{
  "ADVANCED_SEARCH": false,
  "BATCH_OPERATIONS": true,
  "EXPERIMENTAL_TOOL": { "enabled": true, "max_items": 100 }
}
```

**Storage requirements:**
- Flag sets MUST be stored in KV namespace `FEATURE_FLAGS_KV`
- Each flag set MUST be stored with key: `flagset:{set_id}` (e.g., `flagset:production`, `flagset:development`)
- Flag set values MUST be valid JSON
- Missing flag sets MUST NOT crash the application (use default fallback)

**Common flag sets:**
- `production` - Production defaults (typically most features disabled)
- `development` - Development defaults (experimental features enabled)
- Custom sets for specific use cases (e.g., `test-client` for testing environments)

### Flag Set Assignment

Each request is assigned to a flag set through **composable assignment functions**. Functions execute in order, first match wins.

**Assignment function signature:**
```typescript
type FlagSetAssignmentFn = (request: Request, env: Env) => string | null;
```

Functions return:
- **Flag set ID** (string) if the function matches this request
- **null** to pass to the next function in the chain

**Initial implementation (environment-based):**
```typescript
function assignByEnvironment(request: Request, env: Env): string | null {
  if (env.ENVIRONMENT === 'development') return 'development';
  if (env.ENVIRONMENT === 'production') return 'production';
  return null;
}
```

**Future extensions (examples, not required initially):**
- Check `User-Agent` header to detect test clients
- Check `X-Feature-Flags` header for override requests
- Check IP address against allowlist
- Check request path patterns

**Default fallback:**
If no assignment function returns a flag set ID, use `production` as the default.

### Flag Access

The system MUST provide a typed interface for accessing flag values within request handlers:

**Requirements:**
- Flags MUST be loaded once per request (at request start)
- Flag access MUST be type-safe (TypeScript types inferred from schemas)
- Missing flags MUST return default values (not throw errors)
- Flag values MUST be validated against Zod schemas

**Conceptual usage:**
```typescript
async function handleRequest(request: Request, env: Env) {
  const flags = await loadFlags(request, env);

  if (flags.ADVANCED_SEARCH) {
    // New code path
  } else {
    // Original code path
  }
}
```

**[DEFERRED]** The specific API design (utility class, helper functions, middleware) is an implementation decision.

---

## Flag Definition

### Flag Schemas

Each flag MUST have a Zod schema defining its type and validation rules. Schemas serve dual purpose:
1. **Runtime validation** - Validate flag values from KV before use
2. **Type inference** - Generate TypeScript types for flag access

**Schema registry location:**
The schema registry MUST be in code (TypeScript file) to enable type checking. Suggested location: `src/feature-flags/schemas.ts` or similar.

**Example schemas:**
```typescript
import { z } from 'zod';

export const FlagSchemas = {
  ADVANCED_SEARCH: z.boolean(),
  BATCH_OPERATIONS: z.boolean(),
  EXPERIMENTAL_TOOL: z.object({
    enabled: z.boolean(),
    max_items: z.number().min(1).max(1000),
  }),
} as const;
```

### Flag Metadata

Each flag SHOULD be documented with metadata for tracking and cleanup:

**Required metadata:**
- **Name** - Flag identifier (SCREAMING_SNAKE_CASE)
- **Description** - What feature/behavior the flag controls
- **Added date** - When flag was created
- **Owner** - Who's responsible for the flagged feature
- **Target removal** - Expected date to remove flag (typically 3-6 months)

**Metadata location options:**

**Option A: Inline code comments** (recommended for simplicity)
```typescript
export const FlagSchemas = {
  // ADVANCED_SEARCH
  // Description: Enable advanced search with fuzzy matching
  // Added: 2025-01-15
  // Owner: @username
  // Target removal: 2025-04-15 (3 months)
  ADVANCED_SEARCH: z.boolean(),
} as const;
```

**Option B: Separate markdown registry**
Create `docs/feature-flags.md` with a table of all active flags.

**[DEFERRED]** The choice between inline comments and markdown registry is an implementation decision. Both approaches work, choose based on team preference.

### Flag Naming Conventions

Flag names MUST follow these conventions:
- **Format:** SCREAMING_SNAKE_CASE
- **Prefix:** Feature area when helpful (e.g., `SEARCH_ADVANCED_RANKING`, `STORAGE_BATCH_DELETE`)
- **Positive names:** Use `FEATURE_ENABLED` not `FEATURE_DISABLED` (avoid negation)
- **Length:** Keep under 40 characters for readability

---

## Flag Management

### Creating Flags

Process for adding a new flag:

1. **Define schema** in the flag schema registry (TypeScript file)
2. **Add metadata** (inline comment or markdown registry entry)
3. **Set default value** in the `production` flag set in KV
4. **Override in development** flag set in KV if needed for testing
5. **Use flag in code** with proper type checking
6. **Deploy code** that checks the flag
7. **Verify flag works** in development environment

**Schema validation requirement:**
All flag set updates (manual or automated) MUST validate against the schema registry. Invalid flag values MUST be rejected.

**[DEFERRED]** CLI tooling for flag creation is a future enhancement. Initial implementation uses manual KV updates (via wrangler CLI or dashboard).

### Updating Flags

Process for changing flag values at runtime:

1. **Update flag set** in KV (modify JSON blob for target flag set)
2. **Validate against schema** before saving
3. **Wait for edge propagation** (KV updates propagate within seconds to minutes)
4. **Verify change** in target environment
5. **Monitor for issues** after enabling new code paths

**KV propagation:**
- Changes propagate to Cloudflare edge locations automatically
- Propagation typically completes within 60 seconds
- Some edge locations MAY serve old values briefly during propagation

**Rollback:**
Simply update the flag set again to previous values (instant rollback without deployment).

### Removing Flags

Process for removing a flag after feature is complete:

1. **Enable in all flag sets** (ensure feature is enabled everywhere)
2. **Monitor production** for 1 week minimum
3. **Remove flag checks from code** (assume feature always enabled)
4. **Remove schema** from schema registry
5. **Remove from flag sets** in KV
6. **Remove metadata** from registry
7. **Document removal** in commit message

**Cleanup policy:**
- Flags SHOULD be reviewed monthly
- Flags older than 3 months SHOULD be removed or justified
- Flags older than 6 months MUST be removed (enable permanently or delete feature)
- PRs adding flags SHOULD include target removal date in metadata

**Enforcement:**
Flag cleanup is currently manual (honor system). Developers MUST follow the cleanup policy to prevent flag accumulation.

**[DEFERRED]** Automated cleanup enforcement (CI checks, expiration alerts) is a future enhancement.

---

## Flag Set Management

### Flag Set Storage in KV

Flag sets are stored as JSON blobs in KV with the following structure:

**KV key naming:**
- Format: `flagset:{set_id}`
- Examples: `flagset:production`, `flagset:development`, `flagset:test-client`

**Flag set value (JSON):**
```json
{
  "ADVANCED_SEARCH": false,
  "BATCH_OPERATIONS": true,
  "EXPERIMENTAL_TOOL": {
    "enabled": false,
    "max_items": 50
  }
}
```

**Requirements:**
- All values MUST validate against their Zod schemas
- Missing flags in a flag set use the default value from the schema
- Invalid JSON MUST NOT crash the application (log error, use fallback)

### Default Values

Each flag schema SHOULD define a sensible default value that applies when:
- The flag is missing from the flag set
- The flag set is not found in KV
- KV is unavailable (fail-safe behavior)

**[DEFERRED]** The mechanism for defining defaults (schema defaults, separate config file, hardcoded fallbacks) is an implementation decision.

---

## Assignment Function Registration

Assignment functions MUST be registered in a defined order (most specific to least specific). The system evaluates functions in order, using the first non-null result.

**Initial registration (simple):**
```typescript
const assignmentFunctions = [
  assignByEnvironment,  // Returns 'development' or 'production'
  // Future: assignByTestClient,
  // Future: assignByHeader,
];
```

**Function execution:**
1. Call first function with (request, env)
2. If function returns string (flag set ID), stop and use that flag set
3. If function returns null, try next function
4. If all functions return null, use default flag set (`production`)

**Extension pattern:**
Add new assignment functions to the array as more complex targeting is needed. Functions are composable and independent.

**[DEFERRED]** Dynamic function registration, plugin systems, or configuration-based assignment rules are future enhancements. Start with a simple array of functions in code.

---

## Performance Requirements

### Latency Impact

Flag system MUST NOT significantly degrade request performance:

- **Flag set determination:** <10ms (function execution)
- **Flag set loading from KV:** <20ms (single KV read)
- **Total overhead:** <30ms per request

### Caching Strategy

**Per-request caching (REQUIRED):**
- Load flag set once per request
- Cache flag set values for the duration of that request
- Do not make multiple KV calls for the same request

**Cross-request caching (OPTIONAL):**
- MAY cache flag sets in memory across requests (with TTL)
- MUST handle cache invalidation when flag sets change in KV
- Consider memory constraints and cache complexity

**[DEFERRED]** Cross-request caching is an optimization for later if latency becomes an issue.

---

## Testing Requirements

### Test Flag Management

Tests MUST NOT depend on KV state or flag set configuration in KV. Test fixtures SHOULD explicitly define flag values for each test case.

**Approaches:**

**Option A: Mock flag loader**
```typescript
// In tests
const mockFlags = {
  ADVANCED_SEARCH: true,
  BATCH_OPERATIONS: false,
};
```

**Option B: Test-specific flag sets**
Create flag sets specifically for testing (e.g., `flagset:test-enabled`, `flagset:test-disabled`) and load them in test environments.

### Test Coverage

Tests MUST cover both code paths (flag enabled and disabled) for any feature behind a flag:

- Test with flag enabled (new code path)
- Test with flag disabled (original code path)
- Test edge cases in both modes

**[DEFERRED]** Tooling to enforce coverage of both flag paths is a future enhancement.

---

## Security Requirements

### Flag Access Security

The flag system MUST NOT create security vulnerabilities:

- **No bypass via request manipulation** - Assignment functions MUST NOT trust client-provided data without validation
- **Fail-safe defaults** - If KV is unavailable or flag set is invalid, use safe defaults (typically flags disabled)
- **Audit logging** - Flag set assignments SHOULD be logged (anonymized user ID, assigned flag set, timestamp)

### Flag Management Security

Flag set updates MUST be controlled:

- **Schema validation** - All updates MUST validate against Zod schemas
- **Access control** - Only authorized developers can update flag sets in KV (via wrangler CLI or Cloudflare dashboard credentials)
- **Audit trail** - KV write operations are logged by Cloudflare automatically

**[DEFERRED]** Additional security measures (flag change webhooks, approval workflows, admin UI with authentication) are future enhancements.

---

## Integration with CI/CD

### Development Workflow

Feature flags enable merging incomplete work to `main`:

1. **Add flag** with feature disabled in production flag set
2. **Enable in development** flag set for testing
3. **Merge to main** even if feature is incomplete
4. **Deploy to production** (feature remains disabled via flag)
5. **Enable in production** when ready (update KV, no redeploy needed)

### Testing in CI

CI tests SHOULD:
- Use explicit flag values in test fixtures (not dependent on KV)
- Test both code paths where applicable
- Validate flag schemas during CI

**[DEFERRED]** Automated checks for flag hygiene (old flags, unused flags, missing metadata) in CI are future enhancements.

---

## Gradual Rollout (Future)

The current design supports **environment-based flags** (development vs production) and **simple client detection** (test client vs others).

**Deferred capabilities:**
- ❌ Percentage-based rollout (enable for 10% of requests)
- ❌ Geographic rollout (enable for specific regions)
- ❌ User-specific flags (enable for specific users by ID)

These capabilities CAN be added later through additional assignment functions without changing the core architecture. They are explicitly out of scope for initial implementation.

**[DEFERRED]** Gradual rollout features are future enhancements, implement only when needed.

---

## Out of Scope

The following are explicitly NOT part of initial feature flag implementation:

- **Admin UI** for flag management (use wrangler CLI or Cloudflare dashboard)
- **Automated cleanup** enforcement in CI
- **Flag analytics** (which flags are most used, how often flags change)
- **A/B testing framework** (separate concern from feature flags)
- **Flag change webhooks** or notifications
- **Percentage-based rollout** or gradual enablement
- **Flag set versioning** or rollback history

---

## Related Documentation

- [Release](./release.md) - How feature flags enable short-lived feature branches
- [Deployment](./deployment.md) - KV namespace requirements for flag storage
- [Testing](./testing.md) - Test coverage requirements for flagged features
- [Code Checks](./code-checks.md) - Schema validation requirements
