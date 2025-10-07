# Overview

**Version:** 1.1
**Date:** October 7, 2025
**Status:** Draft

---

## Executive Summary

The Second Brain MCP is a Model Context Protocol server that enables Claude to act as a personal knowledge management assistant based on the Building a Second Brain (BASB) methodology by Tiago Forte. The server provides file system-like operations over Cloudflare R2 storage, allowing Claude to capture, organize, distill, and express knowledge using the PARA (Projects, Areas, Resources, Archives) organizational framework.

### Key Objectives

- Enable seamless knowledge capture and retrieval across desktop and mobile Claude clients
- Implement BASB methodology through prompts and guidance rather than hard-coded structure
- Provide simple, composable file operations that Claude can orchestrate into complex workflows
- Maintain single-user simplicity while avoiding architectural constraints for future multi-user support

---

## Background & Methodology

### Building a Second Brain (BASB)

BASB is a personal knowledge management system that externalizes cognition into a digital repository. The methodology consists of two key frameworks:

#### CODE Method
The workflow for knowledge management:
- **Capture**: Keep what resonates (ideas, insights, inspiration)
- **Organize**: Save for actionability using PARA
- **Distill**: Progressively summarize and highlight key points
- **Express**: Transform knowledge into tangible outputs

#### PARA Method
The organizational structure based on actionability:
- **Projects**: Short-term efforts with defined goals and deadlines (most actionable)
- **Areas**: Ongoing responsibilities requiring sustained attention (moderately actionable)
- **Resources**: Topics of interest and reference material (low actionability)
- **Archives**: Inactive items from other categories (not actionable)

---

## Design Philosophy

The MCP should:

1. **Guide, don't enforce**: Provide methodology guidance through prompts, but allow Claude to determine structure
2. **Composable operations**: Simple file operations that Claude orchestrates into sophisticated workflows
3. **Progressive complexity**: Start minimal, let structure emerge organically through use
4. **Mobile-first capture**: Optimized for quick capture on mobile, with deeper processing on desktop

---

## Related Documentation

- [Architecture](./architecture.md) - Technical stack and system design
- [API Reference](./api-reference.md) - Complete tool specifications
- [MCP Configuration](./mcp-configuration.md) - Server setup and prompts
- [User Workflows](./user-workflows.md) - Common usage patterns
- [Roadmap](./roadmap.md) - Future enhancements and success metrics
