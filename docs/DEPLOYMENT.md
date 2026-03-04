# 🏛️ OpenClaw-Org Deployment Guide

> **Deploy the OpenClaw Hierarchical Agent Architecture (v2.2) onto a fresh or existing OpenClaw instance.**
>
> Audience: AI agents, sysadmins, and OpenClaw operators.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture Overview](#2-architecture-overview)
3. [Installation](#3-installation)
4. [Configuration](#4-configuration)
5. [Secrets & Credentials](#5-secrets--credentials)
6. [Verification](#6-verification)
7. [Troubleshooting](#7-troubleshooting)
8. [Upgrade](#8-upgrade)
9. [Uninstall](#9-uninstall)

---

## 1. Prerequisites

### System Requirements

| Requirement | Minimum |
|-------------|---------|
| **OpenClaw** | `>= 2026.2.x` (verify: `openclaw --version`) |
| **Node.js** | `>= 22.x` |
| **OS** | Linux (Ubuntu 22.04+ recommended), macOS |
| **Disk** | ~50 MB for architecture files + workspace per agent |
| **RAM** | No additional beyond OpenClaw base |

### Required Tools

```bash
# Verify OpenClaw is installed and running
openclaw --version
openclaw gateway status

# ClawHub CLI (optional, for one-command install)
clawhub --version  # if not installed: npm i -g clawhub
```

### Required Access

- Shell access to the OpenClaw host
- Write access to `~/.openclaw/` directory tree
- Ability to restart the OpenClaw gateway (`openclaw gateway restart`)
- At least one configured LLM provider in `openclaw.json` (OpenRouter, GitHub Copilot, local proxy, etc.)

---

## 2. Architecture Overview

The deployment creates a **3-agent core** (plus an optional HR agent) with a 6-layer extensible hierarchy:

```
L0  Orchestrator (main)     ← CEO: routes tasks, synthesizes results
├── L1-C  System Admin       ← CTO: infra, config, agent provisioning
├── L1-C  Full Power         ← Emergency Override: max-capability fallback
└── L1-C  HR (optional)      ← Agent governance: onboarding/offboarding
```

Everything beyond these core agents is **pluggable** — add domain-specific departments (L1-D), managers (L2), specialists (L3), operators (L4), and workers (L5) as needed.

### Key Components Deployed

| Component | Location | Purpose |
|-----------|----------|---------|
| Architecture skill | `~/.openclaw/skills/openclaw-org/` | Spec + templates |
| Plugin | `~/.openclaw/workspace/plugins/architecture-enforcer` | Auto-enforcement |
| Main workspace | `~/.openclaw/workspace/` | Orchestrator home |
| Sysadmin workspace | `~/.openclaw/workspace-sysadmin/` | System Admin home |
| Full-power workspace | `~/.openclaw/workspace-full-power/` | Emergency Override home |
| Shared cache | `~/.openclaw/workspace/shared/cache/` | Cross-agent result cache |
| Templates | Skill `assets/templates/` | Provisioning templates |
| Status dashboard | `~/.openclaw/workspace/STATUS.md` | Live org health |

---

## 3. Installation

### Option A: ClawHub (Recommended)

```bash
clawhub install openclaw-org
```

Then proceed to [Step 3.2: Enable the Plugin](#32-enable-the-plugin).

### Option B: Git Clone

```bash
git clone https://github.com/itomtangme/openclaw-org.git \
  ~/.openclaw/skills/openclaw-org
```

### 3.1 Create Directory Structure

```bash
# Main workspace shared directories
mkdir -p ~/.openclaw/workspace/shared/cache/entries
mkdir -p ~/.openclaw/workspace/shared/artifacts

# Agent workspaces
mkdir -p ~/.openclaw/workspace-sysadmin
mkdir -p ~/.openclaw/workspace-full-power

# Agent internal dirs
mkdir -p ~/.openclaw/agents/sysadmin/agent
mkdir -p ~/.openclaw/agents/full-power/agent
```

### 3.2 Enable the Plugin

Symlink the repo into your plugins directory and allow it:

```bash
ln -s ~/.openclaw/skills/openclaw-org \
  ~/.openclaw/workspace/plugins/architecture-enforcer

openclaw config set plugins.allow '["architecture-enforcer"]'
```

On the next gateway restart, the plugin will audit all agent workspaces and auto-write missing hierarchy files (SOUL.md hierarchy section, AGENTS.md, AGENT-MANIFEST.md).

### 3.3 Bootstrap Core Agents

If you have the plugin enabled, the enforcer handles workspace file creation automatically on gateway start. For **manual** setup (or to understand what gets created), see below.

#### 3.3.1 Write Architecture Spec

```bash
SKILL_DIR=~/.openclaw/skills/openclaw-org

# Copy the architecture reference to main workspace
cp "$SKILL_DIR/skill/references/ARCHITECTURE.md" ~/.openclaw/workspace/ARCHITECTURE.md
```

#### 3.3.2 Copy Templates

```bash
# Copy templates (for manual provisioning of new agents)
mkdir -p ~/.openclaw/workspace/templates
cp "$SKILL_DIR/skill/assets/templates/"*-template.md ~/.openclaw/workspace/templates/
```

#### 3.3.3 Per-Agent Workspace Files

Each agent workspace needs these files:

| File | Content |
|------|---------|
| `SOUL.md` | Agent persona + hierarchy delegation protocol |
| `AGENTS.md` | Sub-agent registry (v2.2 format) |
| `AGENT-MANIFEST.md` | Self-declaration — capabilities, contracts, escalation |
| `IDENTITY.md` | Name, emoji, avatar |
| `USER.md` | User context (name, timezone, preferences) |
| `TOOLS.md` | Host-specific tool notes |

Use the templates in `skill/assets/templates/` with variable substitution:

| Variable | Example (sysadmin) | Example (full-power) |
|----------|---------------------|----------------------|
| `{{AGENT_NAME}}` | System Admin | Full Power |
| `{{AGENT_ID}}` | sysadmin | full-power |
| `{{AGENT_TYPE}}` | Core | Core |
| `{{LAYER_CODE}}` | L1-C | L1-C |
| `{{PARENT_ID}}` | main | main |
| `{{LAYER_NUMBER}}` | 1 | 1 |
| `{{TIER_NUMBER}}` | 1 | 1 |

> **Tip**: With the plugin enabled, simply restart the gateway and it will auto-generate these files for any agent in `openclaw.json` that's missing them.

---

## 4. Configuration

### 4.1 Add Agents to `openclaw.json`

Edit `~/.openclaw/openclaw.json` and add the core agents to `agents.list[]`:

```jsonc
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "<your-tier-1-model>",          // e.g., "openrouter/anthropic/claude-opus-4.6"
        "fallbacks": [
          "<tier-2-model>",                         // e.g., "openrouter/anthropic/claude-sonnet-4.6"
          "<tier-3-model>"                           // e.g., "openrouter/google/gemini-3-flash-preview"
        ]
      },
      "workspace": "~/.openclaw/workspace",
      "maxConcurrent": 4,
      "subagents": { "maxConcurrent": 12 }
    },
    "list": [
      {
        "id": "main",
        "subagents": {
          "allowAgents": ["sysadmin", "full-power"]
        }
      },
      {
        "id": "sysadmin",
        "name": "sysadmin",
        "workspace": "~/.openclaw/workspace-sysadmin",
        "agentDir": "~/.openclaw/agents/sysadmin/agent",
        "model": {
          "primary": "<your-tier-1-model>",
          "fallbacks": ["<tier-2-fallback>"]
        },
        "identity": {
          "name": "System Admin",
          "theme": "CTO — manages the OpenClaw system itself",
          "emoji": "🔧"
        }
      },
      {
        "id": "full-power",
        "name": "full-power",
        "workspace": "~/.openclaw/workspace-full-power",
        "agentDir": "~/.openclaw/agents/full-power/agent",
        "model": {
          "primary": "<your-tier-1-model>",
          "fallbacks": ["<tier-2-fallback>"]
        },
        "identity": {
          "name": "Full Power",
          "theme": "Emergency Override — max-capability fallback agent",
          "emoji": "⚡"
        }
      }
    ]
  }
}
```

> **Important**: Replace `<your-tier-1-model>` etc. with actual model IDs from your configured providers.

### 4.2 Model Tier Mapping

Map your available models to the 4-tier system:

| Tier | Purpose | Example Models |
|------|---------|----------------|
| Tier-1 | Max intelligence (L0, L1) | Claude Opus, GPT-5 |
| Tier-2 | Strong capability (L1-D, L2) | Claude Sonnet, Gemini Pro |
| Tier-3 | Fast execution (L3, L4) | Gemini Flash, Claude Haiku |
| Tier-4 | Cheapest (L4, L5) | Small/local models |

### 4.3 Plugin Configuration

```jsonc
{
  "plugins": {
    "allow": ["architecture-enforcer"],
    "config": {
      "architecture-enforcer": {
        "dryRun": false,         // Log changes without writing
        "forceOverwrite": false, // Overwrite even if v2.2 markers present
        "skipAgents": []         // Agent IDs to exclude from enforcement
      }
    }
  }
}
```

### 4.4 Routing

The main agent's `AGENTS.md` doubles as the routing table. The Orchestrator (L0) reads it to decide where to send tasks:

- **Infrastructure/config/agent tasks** → `sysadmin`
- **Explicit "full power" command** → `full-power`
- **Agent onboarding/offboarding** → `hr` (if installed)
- **Domain-specific tasks** → matching L1-D department (if installed)
- **Simple tasks** → handled directly by L0

### 4.5 Restart Gateway

```bash
openclaw gateway restart
```

The plugin will run its enforcement pass on startup, creating or patching any missing workspace files.

---

## 5. Secrets & Credentials

### What Needs Secrets

| Secret | Where Used | How to Set |
|--------|-----------|------------|
| **LLM API keys** | `openclaw.json` → `auth.profiles` | `openclaw wizard` or manual edit |
| **Gateway auth token** | `openclaw.json` → `gateway.auth.token` | Auto-generated on first run |
| **Channel bot tokens** | `openclaw.json` → `channels.<name>.botToken` | Per-channel setup |

### Security Rules

- All secrets live in `~/.openclaw/openclaw.json` (file permissions: `600`)
- Environment variable references are supported: `"apiKey": "${MY_API_KEY}"`
- **Never commit `openclaw.json` to version control** — it contains secrets
- Agent workspaces may contain `.env.*` files — also exclude from VCS

### Minimum Viable Secret Setup

For a working deployment, you need at minimum:

1. **One LLM provider** configured in `openclaw.json` → `auth.profiles`
2. **Gateway token** (auto-generated)
3. **At least one model** resolvable by each agent's `model.primary`

---

## 6. Verification

### 6.1 Pre-Flight Checks

```bash
# 1. Gateway is running
openclaw gateway status

# 2. Config is valid JSON
cat ~/.openclaw/openclaw.json | python3 -m json.tool > /dev/null

# 3. All workspace directories exist
ls -d ~/.openclaw/workspace/
ls -d ~/.openclaw/workspace-sysadmin/
ls -d ~/.openclaw/workspace-full-power/

# 4. Core files present in main workspace
for f in SOUL.md AGENTS.md STATUS.md; do
  test -f ~/.openclaw/workspace/$f && echo "✅ $f" || echo "❌ $f MISSING"
done

# 5. Core files present in each agent workspace
for agent in sysadmin full-power; do
  echo "--- $agent ---"
  for f in SOUL.md AGENTS.md IDENTITY.md; do
    test -f ~/.openclaw/workspace-$agent/$f && echo "  ✅ $f" || echo "  ❌ $f MISSING"
  done
done

# 6. Agents registered in openclaw.json
python3 -c "
import json, os
with open(os.path.expanduser('~/.openclaw/openclaw.json')) as f:
    cfg = json.load(f)
ids = [a['id'] for a in cfg.get('agents',{}).get('list',[])]
for required in ['main','sysadmin','full-power']:
    status = '✅' if required in ids else '❌'
    print(f'  {status} {required}')
"
```

### 6.2 Functional Tests

After gateway restart, test each agent via chat:

| Test | Input | Expected |
|------|-------|----------|
| Orchestrator routing | "What agents are in this system?" | Lists agents from AGENTS.md |
| Sysadmin delegation | "Check system health" | Routes to sysadmin |
| Full-power invocation | "full power — what is 2+2?" | Routes to full-power agent |
| Direct handling | "What time is it?" | L0 handles directly |
| Enforcement | `/enforce` | Plugin audits all agents |

### 6.3 Health Dashboard

Check `~/.openclaw/workspace/STATUS.md` — it should show:

```
Org Health: 🟢 Healthy (Core Only)
Agent Tree: main (🟢), sysadmin (🟢), full-power (⚪ standby)
```

---

## 7. Troubleshooting

### Agent Not Responding

| Symptom | Cause | Fix |
|---------|-------|-----|
| Agent never replies | Not in `openclaw.json` `agents.list[]` | Add agent config, restart gateway |
| Agent not in routing | Not in main's `subagents.allowAgents` | Add to allowlist, restart gateway |
| "Model not found" | Primary model ID doesn't match provider | Check `models.providers` in config |
| Workspace files not read | Wrong `workspace` path in config | Verify path exists and is absolute |

### Gateway Issues

```bash
# Check gateway status
openclaw gateway status

# Restart gateway
openclaw gateway restart

# If restart fails, check config syntax
python3 -m json.tool < ~/.openclaw/openclaw.json
```

### Common Config Mistakes

1. **Relative paths** — Always use absolute paths for `workspace` and `agentDir`
2. **Missing commas** — JSON is strict. Validate before restarting.
3. **Wrong model IDs** — Model ID must match format: `<provider>/<model-name>`
4. **Duplicate agent IDs** — Each `id` in `agents.list[]` must be unique
5. **Agent workspace doesn't exist** — Create the directory before restarting

### Plugin Cache Issues

If you modified TypeScript plugin files:

```bash
# Clear jiti cache before restarting
rm -rf /tmp/jiti/
openclaw gateway restart
```

Config-only changes do NOT need cache clearing.

### Delegation Not Working

1. Check main's `AGENTS.md` includes the target agent
2. Check main's `subagents.allowAgents` includes the agent ID
3. Check the target agent's `SOUL.md` describes its domain correctly
4. Ensure the target agent's model is reachable

---

## 8. Upgrade

### Upgrade the Package

```bash
# Via ClawHub
clawhub update openclaw-org

# Via Git
cd ~/.openclaw/skills/openclaw-org && git pull
```

### Upgrade OpenClaw Itself

```bash
npm update -g openclaw
openclaw gateway restart
```

### After Architecture Version Bump

When the architecture version changes (e.g., v2.2 → v2.3):

1. Pull the latest skill/plugin code
2. Run `/enforce` or restart the gateway — the plugin will re-audit all workspaces
3. Review any changed templates in `skill/assets/templates/`
4. Update `AGENTS.md` version number in all workspaces if needed

> **Preserved on upgrade**: `USER.md`, `TOOLS.md`, `IDENTITY.md`, agent-specific customizations. These are user data and should never be overwritten by the enforcer.

### Adding a New Department (Post-Install)

```bash
# 1. Create workspace
mkdir -p ~/.openclaw/workspace-<dept-id>

# 2. Add to openclaw.json agents.list[]
# 3. Add to parent's subagents.allowAgents
# 4. Restart gateway (plugin auto-generates workspace files)
openclaw gateway restart

# 5. Test with a routing task
```

---

## 9. Uninstall

### Remove a Department (L1-D)

Use the offboard command:

```bash
# Via slash command
/offboard <agent-id>

# Via CLI
openclaw plugins cli architecture-enforcer offboard-agent <agent-id>

# With cascade (removes children too)
openclaw plugins cli architecture-enforcer offboard-agent <agent-id> --force
```

### Manual Removal

```bash
# 1. Remove from openclaw.json agents.list[]
# 2. Remove from parent's subagents.allowAgents
# 3. Archive workspace (never delete):
mv ~/.openclaw/workspace-<agent-id> ~/.openclaw/workspace-<agent-id>.archived.$(date +%F)
# 4. Restart gateway
openclaw gateway restart
```

### Full Architecture Removal

> ⚠️ **This removes the entire hierarchy. The main agent will revert to a single-agent setup.**

```bash
# 1. Remove non-main agents from openclaw.json agents.list[]
# 2. Remove subagents.allowAgents from main
# 3. Archive agent workspaces
for agent in sysadmin full-power; do
  mv ~/.openclaw/workspace-$agent ~/.openclaw/workspace-$agent.archived.$(date +%F)
done

# 4. Remove architecture files from main workspace
rm -f ~/.openclaw/workspace/ARCHITECTURE.md ~/.openclaw/workspace/STATUS.md
rm -rf ~/.openclaw/workspace/shared/ ~/.openclaw/workspace/templates/

# 5. Remove the plugin symlink
rm ~/.openclaw/workspace/plugins/architecture-enforcer

# 6. Remove the skill
rm -rf ~/.openclaw/skills/openclaw-org

# 7. Restart
openclaw gateway restart
```

---

## Quick Reference Card

| Action | Command |
|--------|---------|
| Install | `clawhub install openclaw-org` or `git clone` |
| Enable plugin | Symlink + `openclaw config set plugins.allow '["architecture-enforcer"]'` |
| Check gateway | `openclaw gateway status` |
| Restart gateway | `openclaw gateway restart` |
| Validate config | `python3 -m json.tool < ~/.openclaw/openclaw.json` |
| Enforce architecture | `/enforce` or `openclaw plugins cli architecture-enforcer enforce-architecture` |
| Offboard agent | `/offboard <id>` or `openclaw plugins cli architecture-enforcer offboard-agent <id>` |
| Dry run | `openclaw plugins cli architecture-enforcer enforce-architecture --dry-run` |
| View org status | Read `~/.openclaw/workspace/STATUS.md` |
| Upgrade | `clawhub update openclaw-org` or `cd skill && git pull` |
| Clear plugin cache | `rm -rf /tmp/jiti/` (before restart) |

---

*Deployment Guide v1.0 — Architecture v2.2*
