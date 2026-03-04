# 🏛️ OpenClaw Subagent Architecture

Hierarchical multi-agent architecture framework with **automated enforcement** for [OpenClaw](https://openclaw.com).

> **Skill + Plugin bundle**: Agents *understand* the hierarchy (skill) AND it's *auto-enforced* (plugin).

## The Problem

OpenClaw supports multiple agents, but when you add a new one, nothing automatically:
- Tells it who its parent agent is
- Sets its layer/depth/tier in SOUL.md
- Creates AGENTS.md with the hierarchy registry format
- Creates AGENT-MANIFEST.md with escalation policies
- Updates the central org registry

You end up with agents that don't know their place in the hierarchy.

## The Solution

This package combines:

| Component | What It Does |
|-----------|-------------|
| **Skill** | Agents read the architecture spec, understand layers/protocols/delegation |
| **Plugin** | Gateway hooks auto-write hierarchy files when agents are added or on startup |

## Features

- 🏗️ **6-Layer Hierarchy** — L0 Orchestrator → L1 Director → L2 Manager → L3 Specialist → L4 Operator → L5 Worker
- 🔄 **Auto-Enforcement** — patches SOUL.md, AGENTS.md, AGENT-MANIFEST.md on gateway start and agent spawn
- 🧠 **Smart SOUL.md Patching** — injects hierarchy section without destroying custom persona content
- 👔 **HR Agent** — dedicated governance agent for onboarding/offboarding, with "No Agent Installation" policy enforcement
- 🗑️ **Agent Offboarding** — `/offboard` command for full cleanup (archive workspace, update config, clean references)
- 🛡️ **Idempotent** — only writes when files are missing or incorrect
- 📊 **4-Tier Model System** — cost-efficient model allocation per layer
- 🔌 **Plug-and-Play Departments** — add/remove domain directors anytime
- 📈 **Observability** — STATUS.md dashboard, heartbeat protocol
- 🧩 **Result Caching** — shared cache prevents redundant work across branches

## Quick Start

### 1. Clone
```bash
git clone https://github.com/itomtangme/openclaw-org.git \
  ~/.openclaw/skills/openclaw-org
```

### 2. Symlink plugin
```bash
ln -s ~/.openclaw/skills/openclaw-org \
  ~/.openclaw/workspace/plugins/architecture-enforcer
```

### 3. Enable
```bash
openclaw config set plugins.allow '["architecture-enforcer"]'
openclaw gateway restart
```

That's it. The plugin will audit all agent workspaces on startup and patch any missing hierarchy files.

## Deployment Guide

For a comprehensive step-by-step deployment guide covering prerequisites, configuration, secrets management, verification, troubleshooting, and upgrades, see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## How It Works

```
openclaw.json (agents.list + subagents.allowAgents)
        │
        ▼
┌─────────────────────────────┐
│  Hierarchy Resolution       │
│  Derive parent/child/layer  │
│  from config relationships  │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Per-Agent Enforcement      │
│  Check workspace files      │
│  Write missing/incorrect    │
│  Preserve custom content    │
└──────────┬──────────────────┘
           │
           ▼
    workspace-<agent>/
    ├── SOUL.md         (hierarchy section injected)
    ├── AGENTS.md       (v2.2 registry format)
    └── AGENT-MANIFEST.md (parent, capabilities, escalation)
```

### Hierarchy Resolution

The plugin reads `openclaw.json` and derives hierarchy:
- `agents.list[].id` → agent identity
- `agents.list[].subagents.allowAgents` → parent→child relationships
- `main` = L0, `sysadmin`/`full-power` = L1-C (by convention)
- Depth = walk parent chain → determines layer (L1-D, L2, L3, etc.)

### Enforcement Triggers

| Trigger | Scope |
|---------|-------|
| Gateway starts | All agent workspaces |
| Sub-agent spawned | Newly spawned agent |
| `/enforce` command | All or specific agent |
| CLI `enforce-architecture` | Scriptable, supports `--dry-run` |

## Architecture Overview

```
L0  Orchestrator (main) — CEO, routes & synthesizes
├── L1-C  Core: sysadmin — CTO, manages OpenClaw itself
├── L1-C  Core: full-power — Emergency override
├── L1-C  Core: hr — Agent governance (onboarding/offboarding)
├── L1-D  Department Director (pluggable)
│   ├── L2  Manager
│   │   ├── L3  Specialist
│   │   │   ├── L4  Operator
│   │   │   │   └── L5  Worker (ephemeral)
```

### Model Tiers

| Tier | Layer | Purpose |
|------|-------|---------|
| Tier-1 | L0, L1 | Max intelligence (Opus/GPT-5) |
| Tier-2 | L1-D, L2 | Strong (Sonnet/Gemini Pro) |
| Tier-3 | L3, L4 | Fast (Flash/Haiku) |
| Tier-4 | L4, L5 | Cheapest |

**Rule**: Children inherit or downgrade tier. Never upgrade beyond parent.

## Configuration

```json
{
  "plugins": {
    "allow": ["architecture-enforcer"],
    "config": {
      "architecture-enforcer": {
        "dryRun": false,
        "forceOverwrite": false,
        "skipAgents": ["my-special-agent"]
      }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dryRun` | boolean | `false` | Log changes without writing |
| `forceOverwrite` | boolean | `false` | Overwrite even if v2.2 markers present |
| `skipAgents` | string[] | `[]` | Agent IDs to exclude from enforcement |
| `templateDir` | string | auto | Custom template directory path |
| `hrAgentId` | string | `"hr"` | Agent ID for the HR (governance) agent |

## Commands

### Slash Commands
```
/enforce              — Full audit of all agents
/enforce planner      — Enforce specific agent
/offboard travel      — Remove agent with full cleanup
/offboard travel --force  — Cascade-remove agent + children
```

### CLI
```bash
# Enforce architecture
openclaw plugins cli architecture-enforcer enforce-architecture
openclaw plugins cli architecture-enforcer enforce-architecture --dry-run
openclaw plugins cli architecture-enforcer enforce-architecture --agent planner
openclaw plugins cli architecture-enforcer enforce-architecture --force

# Offboard (remove) agent
openclaw plugins cli architecture-enforcer offboard-agent <agent-id>
openclaw plugins cli architecture-enforcer offboard-agent <agent-id> --force
openclaw plugins cli architecture-enforcer offboard-agent <agent-id> --dry-run
openclaw plugins cli architecture-enforcer offboard-agent <agent-id> --skip-archive
```

## File Structure

```
openclaw-org/
├── package.json                    # Plugin entry + metadata
├── openclaw.plugin.json            # OpenClaw plugin manifest
├── agent/
│   └── hr/                         # HR agent workspace files
│       ├── SOUL.md                 # HR persona + onboard/offboard workflows
│       ├── AGENTS.md               # HR sub-agent registry
│       ├── IDENTITY.md             # HR identity
│       ├── TOOLS.md                # HR tool reference
│       └── HR-DETECTION.md         # Guidance for main on routing to HR
├── plugin/
│   ├── index.ts                    # Lifecycle hooks, /enforce, /offboard commands
│   └── src/
│       └── enforcer.ts             # Core enforcement + offboarding engine
├── skill/
│   ├── SKILL.md                    # Skill entry point
│   ├── assets/templates/           # Workspace file templates
│   │   ├── SOUL-template.md
│   │   ├── AGENTS-template.md
│   │   ├── MANIFEST-template.md
│   │   └── STATUS-template.md
│   └── references/
│       └── ARCHITECTURE.md         # Complete v2.2 specification
├── docs/
│   └── DESIGN.md                   # Design rationale
├── README.md
└── LICENSE
```

## Prior Art

This package supersedes [openclaw-architecture](https://github.com/itomtangme/openclaw-architecture) (skill-only, no enforcement). If you're using the old skill, migrate to this one for automated enforcement.

## License

MIT
