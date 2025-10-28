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
- Each flag set MUST be stored with key: `flagset:{set_id}`
- Flag set values MUST be valid JSON
- Missing flag sets MUST NOT crash the application (use default fallback)

**Key naming policy:**
- Standard format: `flagset:{namespace}:{identifier}`
- Exception: `flagset:default` (the standard default flag set, no secondary namespace)
- Namespaces provide organizational structure for related flag sets
- Example namespaces: `env`, `user`, `client`, `channel`, `custom`

**Example flag set keys:**
- `flagset:default` - The standard default (used when no assignment function matches)
- `flagset:env:production` - Environment-specific (production)
- `flagset:env:staging` - Environment-specific (staging)
- `flagset:user:123` - User-specific flags
- `flagset:client:claude` - Client application-specific
- `flagset:channel:canary` - Rollout channel (for gradual deployment)
- `flagset:custom:experiment-a` - Custom flag set for specific scenarios

**Note:** The KV namespace binding (`FEATURE_FLAGS_KV`) provides environment separation. Production and development workers use different KV namespaces via `wrangler.toml`, so the same flag set key (e.g., `flagset:default`) resolves to different values in each environment.

### Flag Set Assignment

Each request is assigned to a flag set through **composable assignment functions**. Functions execute in order, first match wins.

**Assignment function signature:**
```typescript
type FlagSetAssignmentFn = (request: Request, env: Env) => string | null;
```

Functions return:
- **Flag set ID** (string) if the function matches this request
- **null** to pass to the next function in the chain

**Initial implementation:**
The initial implementation uses a single default flag set (`flagset:default`) with no dynamic assignment functions. Environment separation is achieved through separate KV namespace bindings in `wrangler.toml`:
- Production worker → production `FEATURE_FLAGS_KV` namespace → `flagset:default`
- Development worker → development `FEATURE_FLAGS_KV` namespace → `flagset:default`

**Future extensions:**
Assignment functions enable more sophisticated targeting:
- **User-specific:** Route specific users to `flagset:user:{id}` for beta testing
- **Client-specific:** Route specific clients to `flagset:client:{name}` for compatibility
- **Channel-based:** Route percentage of requests to `flagset:channel:canary` for gradual rollout
- **Header-based:** Route based on custom headers (e.g., `X-Feature-Flag-Set`)

**Default fallback:**
If no assignment function returns a flag set ID, use `default` as the default (maps to `flagset:default` in KV).

**wrangler.toml integration:**
Flag default values CAN be configured in `wrangler.toml` as environment variables with the pattern `FEATURE_FLAG_{FLAG_NAME}`. These provide build-time defaults that override schema defaults but are overridden by KV values. This allows different baseline flag values for development vs production without requiring KV updates.

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

Each flag MUST be documented with metadata using JSDoc-style comments in the schema registry file. This keeps metadata co-located with schemas, enables structured documentation, and allows potential tooling to parse flag information.

**Required metadata fields:**
- `@description` - What feature/behavior the flag controls
- `@added` - When flag was created (YYYY-MM-DD format)
- `@owner` - Who's responsible for the flagged feature (GitHub username)
- `@removal` - Expected date to remove flag (YYYY-MM-DD format, typically 3-6 months from creation)

**JSDoc format example:**
```typescript
export const FlagSchemas = {
  /**
   * Enable advanced search with fuzzy matching and relevance scoring
   * @added 2025-01-15
   * @owner @username
   * @removal 2025-04-15
   */
  ADVANCED_SEARCH: z.boolean(),

  /**
   * Enable batch delete operations for multiple files
   * @added 2025-01-20
   * @owner @username
   * @removal 2025-07-20
   */
  BATCH_OPERATIONS: z.boolean(),

  /**
   * Experimental tool with configurable limits
   * @added 2025-02-01
   * @owner @username
   * @removal 2025-05-01
   */
  EXPERIMENTAL_TOOL: z.object({
    enabled: z.boolean(),
    max_items: z.number().min(1).max(1000),
  }),
} as const;
```

**Benefits of JSDoc approach:**
- Structured and parsable (enables future tooling)
- Co-located with schemas (single source of truth)
- Familiar format for TypeScript developers
- Potential to generate documentation automatically

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
2. **Add JSDoc metadata** (@description, @added, @owner, @removal)
3. **Set default value** in `wrangler.toml` for both production and development environments
4. **Override in KV flag sets** if runtime changes are needed
5. **Use flag in code** with proper type checking
6. **Deploy code** that checks the flag
7. **Verify flag works** in development environment

**Schema validation requirement:**
All flag set updates (manual or automated) MUST validate against the schema registry. Invalid flag values MUST be rejected.

**Flag management automation:**
The system SHOULD provide automated tooling for flag management to reduce manual errors and enforce schema validation. Potential approaches include:
- Command-line scripts that interact with KV via Cloudflare API
- HTTP endpoints within the application (with authentication) for flag updates
- Dashboard UI for flag visualization and modification

The automated system SHOULD:
- Enforce schema validation before accepting flag updates
- Support bulk flag updates across environments
- Provide audit logging of flag changes
- Enable complex flag set operations (flag set composition, merging, etc.)

**Virtual flag sets:**
To enable more complex flag matching scenarios, the system SHOULD support virtual flag sets that combine multiple existing flag sets. For example, a "staging" virtual flag set could be defined as the combination of "production" defaults with specific overrides from a "staging-overrides" flag set. When flag sets are updated, any dependent virtual flag sets SHOULD be recalculated automatically. This maintains the performance requirement of one KV read per request while enabling flexible flag configuration.

**[DEFERRED]** Specific implementation of automated flag management (CLI scripts, API endpoints, dashboard UI) is deferred. Initial implementation MAY use manual KV updates via wrangler CLI or Cloudflare dashboard, but this should be considered temporary.

### Updating Flags

Process for changing flag values at runtime:

1. **Update flag set** via automated tooling (preferred) or manual KV update
2. **Validate against schema** (enforced by tooling or manual check)
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
4. **Remove schema and JSDoc metadata** from schema registry
5. **Remove from flag sets** in KV
6. **Document removal** in commit message

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
- Standard format: `flagset:{namespace}:{identifier}`
- Exception: `flagset:default` (no secondary namespace)
- Examples: `flagset:default`, `flagset:env:production`, `flagset:user:123`, `flagset:client:claude`

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

Flag values are resolved in the following priority order (highest to lowest):
1. **KV flag set values** - Runtime flag values from KV (highest priority)
2. **wrangler.toml environment values** - Build-time environment-specific defaults
3. **Schema defaults** - Hardcoded defaults in Zod schemas (lowest priority, fail-safe)

This layering allows:
- Flags defined in `wrangler.toml` override schema defaults
- Flags in KV override both wrangler.toml and schema defaults
- Safe fallback to schema defaults when both KV and wrangler.toml are unavailable

Each flag schema SHOULD define a sensible default value using `.default()` that applies when:
- The flag is missing from the flag set in KV
- The flag is not configured in wrangler.toml
- KV is unavailable (fail-safe behavior)

**Note:** If a flag schema does not define a `.default()` clause, the flag value will be `undefined` when not provided by KV or wrangler.toml. This allows flags to have genuinely optional values.

---

## Assignment Function Registration

Assignment functions can be optionally provided to route requests to different flag sets. Functions execute in order, using the first non-null result.

**Initial implementation (no assignment functions):**
```typescript
// determineFlagSet returns 'default' when no functions provided
const flagSetId = determineFlagSet(request, env);  // Returns 'default'
```

**With custom assignment functions:**
```typescript
const assignByTestClient: FlagSetAssignmentFn = (req) => {
  const userAgent = req.headers.get('user-agent');
  if (userAgent?.includes('TestClient')) return 'client:test';
  return null;
};

const flagSetId = determineFlagSet(request, env, [assignByTestClient]);
```

**Function execution:**
1. Call first function with (request, env)
2. If function returns string (flag set ID), stop and use that flag set
3. If function returns null, try next function
4. If all functions return null, use default flag set (`default`)

**Extension pattern:**
Pass an array of assignment functions as needed. Functions are composable and independent. No global registration required.

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

**Option A: Mock flag loader (PREFERRED)**
```typescript
// In tests
const mockFlags = {
  ADVANCED_SEARCH: true,
  BATCH_OPERATIONS: false,
};
```

This approach is preferred because it:
- Keeps tests fast (no KV dependency)
- Makes test expectations explicit
- Enables testing of specific flag combinations easily
- Avoids test environment state management

**Option B: Test-specific flag sets**
Create flag sets specifically for testing (e.g., `flagset:test-enabled`, `flagset:test-disabled`) and load them in test environments. This approach MAY be used for integration tests but is NOT recommended for unit tests.

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
