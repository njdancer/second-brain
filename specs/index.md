# Specifications Index

Central registry of all technical specification documents for the Second Brain MCP server project.

---

## Core Specifications

- [Overview](./overview.md) - Project vision, goals, and high-level architecture summary
- [Architecture](./architecture.md) - System design, component interactions, and technical decisions
- [Implementation](./implementation.md) - Module structure, configuration details, and code organization
- [Security](./security.md) - OAuth architecture, authentication flows, and security requirements

## API and Integration

- [API Reference](./api-reference.md) - MCP tools, prompts, and endpoint specifications
- [MCP Configuration](./mcp-configuration.md) - Claude desktop/web client configuration and connection setup
- [User Workflows](./user-workflows.md) - End-to-end user interaction patterns and use cases

## Operations

- [Deployment](./deployment.md) - Hosting platform, environment configuration, and infrastructure requirements
- [Release](./release.md) - CI/CD pipeline, branching strategy, and deployment automation
- [Monitoring](./monitoring.md) - Observability, logging, metrics, and alerting requirements
- [Testing](./testing.md) - Test strategy, coverage requirements, and quality standards

## Planning and Reference

- [Roadmap](./roadmap.md) - Feature priorities, planned enhancements, and future direction
- [Glossary](./glossary.md) - Domain terminology, abbreviations, and technical definitions

---

## Reading Guide

**New Contributors:** Start with [Overview](./overview.md) for project context, then [Architecture](./architecture.md) for technical design. Reference [Glossary](./glossary.md) for unfamiliar terms.

**Implementing Features:** Review [API Reference](./api-reference.md) for interface contracts, [Implementation](./implementation.md) for code structure, and [Testing](./testing.md) for quality requirements.

**Deploying Changes:** Consult [Deployment](./deployment.md) for infrastructure setup, [Release](./release.md) for CI/CD process, and [Monitoring](./monitoring.md) for observability.

**Security Review:** See [Security](./security.md) for OAuth architecture and credential handling requirements.

---

## Maintenance Notes

When creating or modifying specifications:

1. Follow [Spec Guidelines](../docs/spec-guidelines.md) for writing standards
2. Update this index with any new specification documents
3. Keep descriptions concise (one line per spec)
4. Maintain alphabetical order within categories
5. Link using relative paths from `specs/` directory
