---
name: openclaw-org
description: >
  Hierarchical multi-agent architecture framework for OpenClaw with **automated enforcement**.
  Combines a skill (docs, templates, architecture spec) with a plugin (lifecycle hooks) that
  auto-provisions SOUL.md, AGENTS.md, AGENT-MANIFEST.md when new agents are added or the
  gateway restarts. Defines a 6-layer org-chart structure (L0 Orchestrator → L1 Director →
  L2 Manager → L3 Specialist → L4 Operator → L5 Worker) with plug-and-play sub-systems,
  recursive delegation, graceful degradation, result caching, health monitoring, and an
  observability dashboard.
  Use when: (1) setting up a new OpenClaw instance with hierarchical agent management,
  (2) adding or removing domain-specific sub-systems (departments), (3) provisioning
  new agents at any layer, (4) checking or updating the agent org structure,
  (5) bootstrapping the architecture on a fresh install, (6) enforcing hierarchy
  compliance on existing agents. NOT for: single-agent setups that don't need hierarchy.
---

# OpenClaw Subagent Architecture — Skill + Plugin

## What This Is

This package bundles **two things**:

1. **Skill** — architecture documentation, workspace templates, and the v2.2 spec
   (the "what" — read by agents for guidance)
2. **Plugin** — lifecycle hooks that automatically enforce the architecture
   (the "how" — runs at gateway level, writes files)

## Why Both?

| Layer | What It Does | Limitation Alone |
|-------|-------------|------------------|
| **Skill only** | Agents *read* the spec and *know* the hierarchy | No enforcement — newly added agents get no hierarchy files |
| **Plugin only** | Writes hierarchy files on agent add | Agents don't understand *why* the hierarchy exists |
| **Skill + Plugin** | Agents understand the hierarchy AND it's auto-enforced | ✅ Complete solution |

## Installation

### 1. Install as skill (for agent knowledge)
```bash
clawhub install openclaw-org
# or clone:
git clone https://github.com/itomtangme/openclaw-org.git \
  ~/.openclaw/skills/openclaw-org
```

### 2. Install as plugin (for enforcement)

Create a symlink into your plugins directory:
```bash
mkdir -p ~/.openclaw/workspace/plugins
ln -s ~/.openclaw/skills/openclaw-org \
  ~/.openclaw/workspace/plugins/architecture-enforcer
```

### 3. Register the plugin

Add to your `openclaw.json`:
```jsonc
{
  "plugins": {
    "load": {
      "paths": ["~/.openclaw/workspace/plugins"]
    },
    "entries": {
      "architecture-enforcer": {
        "enabled": true,
        "config": {
          "dryRun": false,
          "forceOverwrite": false,
          "skipAgents": []
        }
      }
    }
  }
}
```

> ⚠️ Plugin config goes inside `plugins.entries.<id>.config`, NOT `plugins.config`.
> ⚠️ `plugins.load.paths` is **required** for the gateway to discover plugins. Without it, the plugin won't load.

### 4. Restart gateway
```bash
openclaw gateway restart
```

## What Gets Enforced

When a new agent is added (via `openclaw agents add`, subagent spawn, or gateway start):

| File | What's Written | Condition |
|------|---------------|-----------|
| `SOUL.md` | Hierarchy section (Layer, Parent, Depth) injected | Only if missing or incorrect; preserves custom persona |
| `AGENTS.md` | Sub-agent registry with v2.2 format | Only if missing or lacks v2.2 markers |
| `AGENT-MANIFEST.md` | Self-declaration with parent/capabilities/escalation | Only if missing |
| Main `AGENTS.md` | Central org registry updated | On every enforcement pass |

### What's NOT Overwritten
- Custom persona content in SOUL.md (only the `## Layer` section is touched)
- USER.md, TOOLS.md, IDENTITY.md (these are agent-specific, not hierarchy)
- Any file that already has correct v2.2 hierarchy markers

## How Hierarchy Is Resolved

The plugin reads `openclaw.json` and derives hierarchy from:

1. **`agents.list[].id`** — agent identity
2. **`agents.list[].subagents.allowAgents`** — parent→child relationships
3. **`agents.list[].identity`** — name, theme, emoji
4. **Core agent convention** — `main` = L0, `sysadmin`/`full-power`/`hr` = L1-C
5. **Depth calculation** — walks the parent chain to determine layer number

## Slash Commands

| Command | Description |
|---------|-------------|
| `/enforce` | Run full audit on all agent workspaces |
| `/enforce <agent-id>` | Enforce a specific agent |
| `/offboard <agent-id>` | Remove an agent with full cleanup (archive, config, refs) |
| `/offboard <agent-id> --force` | Cascade-remove agent and all its children |

## Agent Governance (HR)

The **HR agent** (`hr`) is a Core (L1-C) agent responsible for all agent onboarding and offboarding.

- **Only HR** (or main/user) may add or remove agents
- All other agents have a "No Agent Installation" policy injected into their AGENTS.md
- The enforcer plugin automatically checks for HR on startup and warns if missing
- Main's SOUL.md is injected with an "Agent Governance" section routing agent requests to HR

See `agent/hr/SOUL.md` for HR's full onboarding/offboarding workflows.

### Installing the HR Agent

HR is **not auto-installed** — only its blueprint files are included. To activate:

```bash
# 1. Register agent
openclaw agents add hr

# 2. Copy workspace blueprint
cp -r ~/.openclaw/skills/openclaw-org/agent/hr/* ~/.openclaw/workspace-hr/

# 3. Add to main's routing (openclaw.json: main.subagents.allowAgents += "hr")

# 4. Restart gateway
openclaw gateway restart
```

## Triggering Enforcement

Enforcement runs **automatically** — no manual CLI needed:

| Trigger | When |
|---------|------|
| **Gateway start/restart** | `openclaw gateway restart` — full audit of all agents |
| **Sub-agent spawn** | Any time a sub-agent is spawned — real-time patching |
| **`/enforce` slash command** | On-demand via agent chat (e.g. "run /enforce") |
| **`/enforce <agent-id>`** | Enforce a specific agent |
| **`/offboard <agent-id>`** | Remove an agent with full cleanup |
| **`/offboard <agent-id> --force`** | Cascade-remove agent and all children |

> **Note:** `openclaw plugins cli` is not currently a supported OpenClaw subcommand.
> Enforcement is handled via lifecycle hooks (gateway start, sub-agent spawn) and
> slash commands (`/enforce`, `/offboard`). A standalone CLI script may be added in
> a future version.

## Architecture Overview (v2.2)

See `references/ARCHITECTURE.md` (relative to this skill directory) for the complete specification.

### 6-Layer Hierarchy

```
L0  Orchestrator (main) — CEO, routes & synthesizes
├── L1-C  Core: sysadmin, full-power, hr
├── L1-D  Department Directors (pluggable)
│   ├── L2  Managers
│   │   ├── L3  Specialists
│   │   │   ├── L4  Operators
│   │   │   │   └── L5  Workers (ephemeral)
```

### 4-Tier Model System

| Tier | Layer | Purpose |
|------|-------|---------|
| Tier-1 | L0, L1 | Max intelligence |
| Tier-2 | L1-D, L2 | Strong capability |
| Tier-3 | L3, L4 | Fast & capable |
| Tier-4 | L4, L5 | Cheapest |

Rule: children inherit or downgrade tier. Never upgrade beyond parent.

## File Structure

```
openclaw-org/
├── package.json                    # "main": "index.ts" — plugin entrypoint
├── openclaw.plugin.json            # Plugin manifest (same dir as entrypoint)
├── index.ts                        # Plugin lifecycle hooks, /enforce, /offboard
├── src/
│   └── enforcer.ts                 # Core enforcement + offboarding engine
├── agent/
│   └── hr/                         # HR agent workspace blueprint files
│       ├── SOUL.md
│       ├── AGENTS.md
│       ├── IDENTITY.md
│       ├── TOOLS.md
│       └── HR-DETECTION.md
├── plugin/                         # Legacy entrypoints (backwards compat)
│   ├── index.ts
│   └── src/enforcer.ts
├── skill/
│   ├── SKILL.md                    # This file (skill entry point)
│   ├── assets/templates/           # Workspace provisioning templates
│   │   ├── SOUL-template.md
│   │   ├── AGENTS-template.md
│   │   ├── MANIFEST-template.md
│   │   └── STATUS-template.md
│   └── references/
│       └── ARCHITECTURE.md         # Complete v2.2 spec (source of truth)
├── docs/
│   ├── DESIGN.md                   # Design decisions & rationale
│   └── DEPLOYMENT.md               # Legacy deployment guide
├── DEPLOYMENT.md                   # Full deployment guide (current)
├── README.md
└── LICENSE
```
