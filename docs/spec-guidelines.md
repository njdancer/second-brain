# Technical Specification Document Guidelines

## Purpose

These guidelines help AI agents generate technical specification documents that define project requirements with precision and clarity. Specifications should capture the complete definition of done while remaining focused on *what* needs to be achieved rather than implementation details.

## Core Principles

### Requirements, Not Implementation

Specifications define outcomes, behaviors, and constraints—not step-by-step solutions. While technical mechanisms may be specified where they form part of the requirement (e.g., "must use OAuth 2.0 for third-party authentication"), avoid prescribing internal implementation details unless they're genuine constraints.

**Good:** "The system must validate email addresses against RFC 5322 and reject invalid formats with specific error messages."
**Poor:** "Create a EmailValidator class with a regex pattern that checks for @ symbols and domain extensions…"

### Expressive Clarity

Write primarily in prose, using structured formats only where they add clarity. A well-written paragraph often conveys relationships, context, and nuance better than bullet points.

Use varied formats appropriately:

- **Prose** for describing behaviors, relationships, rationale, and system interactions
- **Tables** for data structures, comparison matrices, or configuration values
- **Diagrams** (Mermaid/PlantUML) for workflows, state machines, or system boundaries
- **Lists** sparingly, for true enumerations like error codes or API endpoints

### Technical Precision

Every statement should be unambiguous and verifiable. Use precise technical language and define domain-specific terms on first use.

**Requirement Levels:**

- **MUST/REQUIRED** - Absolute requirements
- **SHOULD/RECOMMENDED** - Strong preferences with valid exceptions
- **MAY/OPTIONAL** - Truly optional features

Flag areas needing clarification with **[NEEDS CLARIFICATION: specific question]** rather than making assumptions.

### Defining Scope

Be explicit about what the specification does NOT cover. Use **[OUT OF SCOPE]** markers for functionality that exists but isn't being specified, and **[DEFERRED]** for decisions intentionally left to implementation. This prevents both over-specification and confusion about omissions.

## Document Structure

### Organization by Domain

Group related functionality into cohesive documents organized by business domain or technical boundary. Each document should be self-contained yet reference others where dependencies exist.

Cross-reference other specifications using markdown links with descriptive text:
`See [Authentication Flow](../auth/authentication-spec.md#token-validation) for token format requirements.`

### External References

When requirements depend on external standards (RFC, ISO, etc.) or third-party systems, link directly to authoritative sources. Don't reproduce external documentation—reference it and specify only your integration points and constraints.

### Common Document Types

While not prescriptive, these patterns often emerge:

**System Boundaries** - Define interfaces, APIs, and integration points
**Data Models** - Specify entities, relationships, and invariants
**Business Rules** - Capture domain logic, calculations, and constraints
**User Flows** - Document end-to-end processes and state transitions
**Quality Attributes** - Define performance, security, and reliability requirements

## File Organization

### Directory Structure

All specification documents live in the `specs/` directory at the project root. Maintain a generally flat structure, but create subdirectories where natural groupings emerge (e.g., `specs/auth/`, `specs/payments/`).

### Index Maintenance

The `specs/index.md` file serves as the central registry of all specifications. **Every specification document MUST be listed here with a concise description.** This index enables efficient agentic search and discovery.

**Example index.md entry:**

```markdown
## Specifications Index

- [Authentication](./authentication.md) - User authentication flows, session management, and credential requirements
- [Data Models](./data-models.md) - Core entity definitions, relationships, and data invariants
- [Payment Processing](./payments/payment-processing.md) - Payment gateway integration, transaction handling, and reconciliation rules
```

When creating or modifying specifications, always update the index to maintain discoverability.

## Writing Process

### Active Collaboration

Before drafting, you should:

1. Ask clarifying questions about ambiguous requirements
1. Challenge assumptions that seem inconsistent
1. Identify gaps in the provided information
1. Verify understanding of technical constraints

### Consistency Checking

- Review existing specifications for terminology and patterns
- Ensure new requirements don't contradict established ones
- Maintain consistent abstraction levels across documents
- Verify technical accuracy of all claims

### Conciseness Without Loss

Every word should earn its place. Remove redundancy and filler while preserving all essential information. Technical detail is valuable; verbose explanation is not.

## Example Transformation

**Poor (list-heavy, implementation-focused):**

```
User Authentication Module
- Implement login endpoint
- Use bcrypt for password hashing
- Store sessions in Redis
- Steps:
  1. Receive username/password
  2. Query database for user
  3. Compare hashed passwords
  4. Generate session token
  5. Return token to client
```

**Better (requirements-focused, balanced format):**

```
## User Authentication

The system must authenticate users through credentials verification and maintain secure sessions across requests. Authentication failures must be distinguishable without revealing whether usernames exist in the system.

### Credential Verification
Authentication requires a valid username-password pair verified against stored credentials. The system MUST use a computationally expensive hashing algorithm (minimum bcrypt cost factor 12) and MUST complete authentication attempts in constant time to prevent timing attacks.

### Session Management
Successful authentication establishes a session identified by a cryptographically secure token (minimum 256 bits entropy). Sessions MUST expire after 24 hours of inactivity and MAY support explicit termination. The system MUST validate session tokens on every authenticated request.

[NEEDS CLARIFICATION: Should sessions persist across server restarts?]
```

## Quick Quality Check

Before finalizing, verify the document:

- Can someone implement this without asking "what exactly should happen when…"?
- Could two developers build compatible systems from this spec alone?
- Does every paragraph add essential information?
- Is the document primarily prose with structured formats used purposefully?
- Have all [NEEDS CLARIFICATION] markers been resolved?
- Has the `specs/index.md` been updated with this document?
