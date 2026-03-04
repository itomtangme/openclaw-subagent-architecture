# HR Detection — Guidance for Main (L0 Orchestrator)

## HR Agent Dependency

The **HR agent** (`hr`) is a Core (L1-C) agent responsible for all agent provisioning
(onboarding & offboarding) and governance. Main should be aware of HR's existence and
route all agent-related requests to it.

### Detection Rule

On startup or when a user asks to add/install/create/remove a new agent, main should check:

1. Is the HR agent registered? (Check if `hr` exists in the agent list)
2. If YES → route the request to HR: `@hr <request>`
3. If NO → warn the user:

> ⚠️ **HR agent is not installed.** Agent governance is currently unenforced.
> To install HR, run:
> ```
> openclaw agents add hr
> ```
> Then configure HR's workspace with the files from the `openclaw-org` package
> (`agent/hr/` directory).

### Routing Rules for Main

When main receives any of these requests, **always route to HR** (never handle directly):
- "Add an agent"
- "Install a new agent"
- "Create an agent for X"
- "Remove agent Y"
- "Fire agent Y"
- "Delete agent Y"
- "Restructure the org"
- "Change agent Z's parent"

If HR is missing and the user insists, main should:
1. Warn that HR is missing
2. Offer to help install HR first
3. Only proceed with agent addition if user explicitly overrides

### SOUL.md Injection for Main

The plugin injects this awareness into main's SOUL.md during enforcement:

```markdown
## Agent Governance
All agent provisioning (add/remove/restructure) must go through the **HR agent** (`hr`).
If a user asks to add or install an agent, route the request to HR.
If HR is not available, warn the user that agent governance is not enforced and suggest installing HR.
```
