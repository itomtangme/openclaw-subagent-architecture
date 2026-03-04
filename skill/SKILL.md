---
name: openclaw-subagent-architecture
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
clawhub install openclaw-subagent-architecture
# or clone:
git clone https://github.com/itomtangme/openclaw-subagent-architecture.git \
  ~/.openclaw/skills/openclaw-subagent-architecture
```

### 2. Install as plugin (for enforcement)

Create a symlink or copy the plugin into your plugins directory:
```bash
# Option A: Symlink (recommended — stays updated)
ln -s ~/.openclaw/skills/openclaw-subagent-architecture \
  ~/.openclaw/workspace/plugins/architecture-enforcer

# Option B: Copy
cp -r ~/.openclaw/skills/openclaw-subagent-architecture \
  ~/.openclaw/workspace/plugins/architecture-enforcer
```

### 3. Enable the plugin
Add to your `openclaw.json` under `plugins`:
```json
{
  "plugins": {
    "allow": ["architecture-enforcer"]
  }
}
```

### 4. (Optional) Configure
```json
{
  "plugins": {
    "allow": ["architecture-enforcer"],
    "config": {
      "architecture-enforcer": {
        "dryRun": false,
        "forceOverwrite": false,
        "skipAgents": []
      }
    }
  }
}
```

### 5. Restart gateway
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
4. **Core agent convention** — `main` = L0, `sysadmin`/`full-power` = L1-C
5. **Depth calculation** — walks the parent chain to determine layer number

## Slash Commands

| Command | Description |
|---------|-------------|
| `/enforce` | Run full audit on all agent workspaces |
| `/enforce <agent-id>` | Enforce a specific agent |

## CLI

```bash
openclaw plugins cli architecture-enforcer enforce-architecture
openclaw plugins cli architecture-enforcer enforce-architecture --dry-run
openclaw plugins cli architecture-enforcer enforce-architecture --agent planner
openclaw plugins cli architecture-enforcer enforce-architecture --force
```

## Architecture Overview (v2.2)

See `skill/references/ARCHITECTURE.md` for the complete specification.

### 6-Layer Hierarchy

```
L0  Orchestrator (main) — CEO, routes & synthesizes
├── L1-C  Core: sysadmin, full-power
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
openclaw-subagent-architecture/
├── package.json                    # NPM package (plugin entry point)
├── openclaw.plugin.json            # Plugin manifest for OpenClaw
├── plugin/
│   ├── index.ts                    # Plugin entry — hooks & commands
│   └── src/
│       └── enforcer.ts             # Core enforcement engine
├── skill/
│   ├── SKILL.md                    # This file (skill entry point)
│   ├── assets/
│   │   └── templates/
│   │       ├── SOUL-template.md
│   │       ├── AGENTS-template.md
│   │       ├── MANIFEST-template.md
│   │       └── STATUS-template.md
│   └── references/
│       └── ARCHITECTURE.md         # Complete v2.2 spec (source of truth)
├── docs/
│   └── DESIGN.md                   # Design decisions & rationale
├── README.md
└── LICENSE
```
