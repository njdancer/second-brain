# Autopilot Mode: Execute PLAN.md Autonomously

Work through [PLAN.md](../../../PLAN.md) autonomously without stopping unless you hit a blocker.

## Operating Mode

1. Identify the next incomplete task in the current phase
2. Implement it following the project workflow (see [CLAUDE.md](../../../CLAUDE.md))
3. Move to the next task
4. Repeat until phase is complete or you hit a blocker

## When to STOP and Escalate

**Only stop when:**

1. **Technical Blockers:** Architecture decisions needed, dependencies broken, unforeseen limitations, test coverage impossible without design change

2. **Spec Issues:** Specifications unclear/contradictory/incomplete, requirements seem wrong, missing critical information

3. **External System Access Needed:** GitHub configuration, Cloudflare setup (R2/KV/Workers), AWS setup (S3/IAM), remote repository operations, production deployment

4. **Major Decisions:** Work that significantly changes timeline, security issues needing discussion, substantial deviations from PLAN.md required

## Status Reporting

Brief updates as you work:
- "✅ Completed [task] - [tests passing]"
- "🔨 Working on [task]"
- "📝 Updated PLAN.md"

---

**Begin autonomous execution now. Start with the current phase in PLAN.md.**
