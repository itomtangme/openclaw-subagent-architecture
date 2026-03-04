# Design Decisions — Architecture Enforcer

## Problem

The original `openclaw-architecture` skill defines a beautiful 6-layer hierarchy,
but it only works as **documentation that agents read**. When you add a new agent via
`openclaw agents add`, nothing automatically:

1. Tells the new agent who its parent is
2. Sets its layer/depth/tier in SOUL.md
3. Creates an AGENTS.md with the v2.2 registry format
4. Creates an AGENT-MANIFEST.md with parent/capability declarations
5. Updates the main workspace AGENTS.md central registry

The hierarchy existed on paper but was never enforced in practice.

## Why Skill-Only Doesn't Work

Skills are read-time guidance — they inform agents HOW to behave but have no
execution hooks. A skill cannot:

- React to `openclaw agents add` events
- Write files to another agent's workspace
- Run code on gateway start
- Register CLI commands or slash commands

Skills are **passive knowledge**. Enforcement needs **active behavior**.

## Why Plugin-Only Doesn't Work Either

A plugin can hook into lifecycle events and write files, but:

- Agents still need to UNDERSTAND the hierarchy (why they report to a parent,
  how to use the delegation protocol, what the tier system means)
- Without the skill's ARCHITECTURE.md as context, agents would have hierarchy
  files but no understanding of the framework
- Templates need to be customizable — skill assets are the right place for this

## Solution: Skill + Plugin Bundle

| Component | Role |
|-----------|------|
| **Skill** | Agent reads SKILL.md → understands the architecture, protocols, layers |
| **Plugin** | Gateway hooks → enforces correct files on every agent workspace |

The plugin reads `openclaw.json` to derive the hierarchy (using `subagents.allowAgents`
for parent→child relationships), then writes correctly-templated hierarchy files to
each agent's workspace.

## Hierarchy Resolution Algorithm

```
1. Read openclaw.json → agents.list[]
2. For each agent:
   a. id = "main" → L0 Orchestrator
   b. id in ["sysadmin", "full-power", hrAgentId] → L1-C Core
   c. For all others, find parent by scanning which agent's
      subagents.allowAgents contains this agent's id
   d. If parent = "main" → L1-D Department Director
   e. Otherwise, walk up the parent chain to count depth → L2/L3/L4/L5
3. Tier = f(depth): L0-L1→Tier-1, L1-D/L2→Tier-2, L3-L4→Tier-3, L5→Tier-4
```

## SOUL.md Strategy: Inject, Don't Replace

The most sensitive file is SOUL.md — users carefully craft personas. The enforcer:

1. Checks if `## Layer` section exists with correct parent/depth/type
2. If correct → skip (no write)
3. If missing → inject `## Layer` section after first heading
4. If incorrect → replace only the `## Layer` section, preserve everything else

This means hand-written personality, rules, and custom sections are never lost.

## Enforcement Triggers

| Trigger | What Happens |
|---------|-------------|
| `gateway_start` | Full audit of all agent workspaces |
| `subagent_spawned` | Patch the newly spawned agent's workspace |
| `/enforce` command | On-demand full audit |
| `/enforce <id>` command | On-demand single agent |
| CLI `enforce-architecture` | Scriptable, supports --dry-run |

## Idempotency

Every enforcement operation is idempotent:
- Files with correct v2.2 markers → skipped
- SOUL.md with correct Layer section → skipped
- Only missing or incorrect data triggers writes
- `--force` flag available when explicit overwrite is needed

## What We Don't Do

- **Don't touch openclaw.json for non-agent settings** — only the offboard command modifies agents.list
- **Don't create agent workspaces** — `openclaw agents add` does that
- **Don't start/stop agents** — that's the gateway's job
- **Don't touch USER.md, TOOLS.md, IDENTITY.md** — those are agent-specific, not hierarchy

## Agent Governance (HR)

The HR agent (`hr`) is a mandatory L1-C Core agent responsible for agent lifecycle:

- **Onboarding**: Only HR may add new agents. All other agents have a "No Agent Installation"
  policy injected into their AGENTS.md by the enforcer.
- **Offboarding**: HR uses `/offboard` to cleanly remove agents (archive workspace, update config,
  clean references). The offboard operation works on a deep copy to avoid mutating live config,
  and writes openclaw.json exactly once.
- **Main awareness**: The enforcer injects an "Agent Governance" section into main's SOUL.md,
  instructing it to route all agent provisioning requests to HR.
- **Protected agents**: main, sysadmin, full-power, and hr itself cannot be offboarded.
