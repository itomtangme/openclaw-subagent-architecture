# 🏛️ OpenClaw Hierarchical Agent Architecture v2.2 (Universal Framework)

## 1. Vision

A **portable, plug-and-play agent hierarchy** that works on any OpenClaw installation. The architecture defines **how agents organize, communicate, and scale** — not what specific agents exist. Any domain sub-system can be installed or removed without breaking the structure.

---

## 2. Design Philosophy

- **The architecture is the skeleton, not the organs.** It defines the shape, not the function.
- **Only universally necessary agents are pre-defined.** Everything else is pluggable.
- **Any agent can have sub-agents.** Recursive by design.
- **Zero domain assumptions.** A fresh install has no travel, no coding, no research agents — just the core.
- **Self-healing.** The system degrades gracefully, never hard-fails.
- **Observable.** The org's health is visible at a glance at all times.

---

## 3. The Core Hierarchy (4 Mandatory Agents)

```
┌─────────────────────────────────────┐
│  L0: Orchestrator (main)            │
│  "The CEO"                          │
│  Routes tasks, synthesizes results  │
│  Handles simple tasks directly      │
├─────────────────────────────────────┤
│                                     │
│  L1-Core: System Admin (sysadmin)   │
│  "The CTO"                          │
│  Manages the OpenClaw system itself  │
│  System config, infra, plugins      │
│                                     │
│  L1-Core: Full Power (full-power)   │
│  "The Emergency Override"           │
│  Max-capability fallback            │
│  Only invoked by explicit command   │
│                                     │
│  L1-Core: HR (hr)                   │
│  "The Agent Governance Officer"     │
│  Sole authority for agent lifecycle │
│  Onboarding, offboarding, reorgs   │
│                                     │
└─────────────────────────────────────┘
```

### Why these four?

| Agent | Why mandatory |
|-------|---------------|
| **Orchestrator** | Every org needs a leader. Entry point for all human interaction. |
| **System Admin** | Self-maintenance layer. Without it, you can't manage the system. |
| **Full Power** | Emergency escalation. Raw-power fallback when everything else fails. |
| **HR** | Agent governance. Without it, any agent could install/remove others — chaos. |

---

## 4. The 6-Layer Hierarchy

| Layer | Code | Role | Can spawn children? | Persistence | Model Tier |
|-------|------|------|---------------------|-------------|------------|
| **L0** | Orchestrator | CEO — routes, synthesizes, handles simple tasks | ✅ → L1 | Permanent | Tier-1 |
| **L1** | Director | Department head — domain authority, strategic decisions | ✅ → L2 | Permanent | Tier-1 or Tier-2 |
| **L2** | Manager | Sub-domain manager — coordinates within a department | ✅ → L3 | Permanent or Session | Tier-2 |
| **L3** | Specialist | Focused expert — executes specific skill areas | ✅ → L4 | Session or On-demand | Tier-3 |
| **L4** | Operator | Task executor — handles concrete, scoped actions | ✅ → L5 | On-demand | Tier-3 or Tier-4 |
| **L5** | Worker | Atomic unit — single-purpose, ephemeral, no children | ❌ | Ephemeral (one-shot) | Tier-4 |

### Example (illustrative, not prescribed)

```
L0  Orchestrator (main)
│
├── L1  Director: Lifestyle
│   ├── L2  Manager: Travel
│   │   ├── L3  Specialist: Asia Travel
│   │   │   ├── L4  Operator: Japan Itinerary Builder
│   │   │   │   └── L5  Worker: Kyoto Restaurant Finder
│   │   │   └── L4  Operator: Flight Scanner
│   │   └── L3  Specialist: Europe Travel
│   └── L2  Manager: Finance
│
├── L1  Director: Engineering
│   ├── L2  Manager: Frontend
│   │   └── L3  Specialist: React Developer
│   └── L2  Manager: Backend
│
└── L1  Core: System Admin
    └── L2  Manager: Monitoring
        └── L3  Specialist: Health Checker
```

**Practical note:** Most installations will use 3-4 layers. Layers 4-5 exist for deeply decomposable tasks.

---

## 5. Agent Classification System

### 5.1 Agent Types

| Type | Code | Description | Pre-installed? |
|------|------|-------------|----------------|
| **Orchestrator** | `L0` | Single root. Routes, synthesizes. | ✅ Always |
| **Core** | `L1-C` | System-essential. Cannot be uninstalled normally. | ✅ Always |
| **Department** | `L1-D` | Domain-specific director. Installable/removable. | ❌ Pluggable |
| **Manager** | `L2` | Reports to L1. Coordinates a sub-domain. | ❌ Pluggable |
| **Specialist** | `L3` | Focused expertise under a manager or director. | ❌ Pluggable |
| **Operator** | `L4` | Scoped task executor. | ❌ On-demand |
| **Worker** | `L5` | Atomic, ephemeral, one-shot. | ❌ Ephemeral |

### 5.2 Persistence Model

| Mode | Description | Used By |
|------|-------------|---------|
| **Permanent** | In `openclaw.json`. Own workspace. Survives restarts. | L0, L1, some L2 |
| **Session** | Spawned via `sessions_spawn(mode: "session")`. Persists within thread. | L2, L3 |
| **On-demand** | Spawned via `sessions_spawn(mode: "run")`. One-shot, then gone. | L3, L4 |
| **Ephemeral** | Spawned inline within parent's session. No independent identity. | L5 |

---

## 6. Agent Manifest Standard

Every permanent/session agent declares itself via `AGENT-MANIFEST.md` in its workspace root.

```markdown
# Agent Manifest

## Identity
- **ID**: <agent-id>
- **Name**: <display name>
- **Type**: <L0 | L1-C | L1-D | L2 | L3>
- **Parent**: <parent-agent-id>
- **Version**: <semver>

## Capabilities
- <what this agent can do — bullet list>

## Accepts (Input Contract)
- <what inputs it expects>

## Produces (Output Contract)
- <what it returns>

## Sub-Agents
| ID | Type | Persistence | Description |
|----|------|-------------|-------------|
| <id> | <type> | <permanent/session/on-demand> | <description> |

## Model Requirements
- Minimum Tier: <tier number>
- Recommended Tier: <tier number>

## Dependencies
- <tools, external services, other agents>

## Escalation Policy
- Escalates to: <parent-id>
- Escalation triggers: <conditions>
```

---

## 7. Agent Registry (Central Truth)

`AGENTS.md` in main workspace — the **single source of truth**:

```markdown
# AGENTS.md — Org Registry

## Architecture
- Version: 2.2
- Max Depth: 6 layers (L0-L5)
- Core Agents: 4 (immutable: main, sysadmin, full-power, hr)

## Agent Tree
| ID | Name | Type | Layer | Parent | Model Tier | Status |
|----|------|------|-------|--------|------------|--------|
| main | All-for-One | L0 | 0 | — | Tier-1 | ✅ Active |
| sysadmin | System Admin | L1-C | 1 | main | Tier-1 | ✅ Active |
| full-power | Full Power | L1-C | 1 | main | Tier-1 | ✅ Active |

## Installed Departments
(none — install via sysadmin)

## Routing Rules
(auto-derived from manifests)
```

---

## 8. Model Tier System

| Tier | Purpose | Default Mapping | Typical Layer |
|------|---------|-----------------|---------------|
| **Tier-1** | Maximum intelligence. Complex reasoning, strategic decisions. | Claude Opus / GPT-5 | L0, L1 |
| **Tier-2** | Strong capability. Analysis, coordination. | Claude Sonnet / Gemini Pro | L1-D, L2 |
| **Tier-3** | Fast & capable. Execution-focused. | Gemini Flash / Claude Haiku | L3, L4 |
| **Tier-4** | Cheapest. Atomic tasks, simple transforms. | Gemini Flash (low) | L4, L5 |

**Tier Inheritance Rule**: Children inherit parent's tier or downgrade. Never upgrade beyond parent.

---

## 9. Communication Protocol

### 9.1 Downward (Delegation)
```
[TASK FROM: <parent-id> (L<n>) → <child-id> (L<n+1>)]
Goal: <what to accomplish>
Context: <relevant background>
Constraints: <budget, language, format, deadline>
Output Format: <what to return>
Depth: <current depth in delegation chain>
```

### 9.2 Upward (Results)
```
[RESULT FROM: <child-id> (L<n>) → <parent-id> (L<n-1>)]
Status: complete | partial | failed | escalate
Summary: <1-2 line summary>
Artifacts: <file paths or inline data>
Notes: <anything the parent should know>
```

### 9.3 Escalation
```
[ESCALATE FROM: <child-id> (L<n>) → <parent-id> (L<n-1>)]
Reason: <why this can't be handled>
Attempted: <what was tried>
Recommendation: <suggested next step>
```

Parent decides: handle it, re-route, or escalate further up. Can bubble all the way to L0.

### 9.4 Lateral Communication
Agents at the same level **cannot talk directly**. All cross-branch communication routes through the **nearest common ancestor**.

```
L2 (Travel Manager) needs data from L2 (Finance Manager)
  → Travel escalates to L1 (Lifestyle Director)
  → Director dispatches to Finance Manager
  → Result returns via Director to Travel Manager

If branches are under different L1s:
  → Routes all the way up to L0
```

---

## 10. Agent Health & Heartbeat Protocol

Every permanent agent (L0–L2) maintains a heartbeat. Not just "alive or dead" — a **capability report** for intelligent routing.

### 10.1 Heartbeat Report Format

Each agent writes to `HEARTBEAT-STATUS.md` in its workspace:

```markdown
# Heartbeat Status

## Last Updated: <ISO timestamp>
## Agent: <agent-id> (L<n>)

## Health
- **Status**: healthy | degraded | overloaded | error
- **Uptime Since**: <ISO timestamp>

## Workload
- **Active Tasks**: <count>
- **Queued Tasks**: <count>
- **Last Task Completed**: <ISO timestamp>
- **Last Task Status**: success | partial | failed

## Sub-Agent Health
| Sub-Agent | Status | Active Tasks |
|-----------|--------|-------------|
| <id> | healthy | 2 |
| <id> | degraded | 0 |

## Capacity
- **Available**: yes | limited | no
- **Reason** (if not available): <explanation>
```

### 10.2 Heartbeat Schedule

| Layer | Frequency | Method |
|-------|-----------|--------|
| L0 | Every heartbeat cycle (system-managed) | HEARTBEAT.md tasks |
| L1 | On activity + periodic (cron) | Auto-update HEARTBEAT-STATUS.md |
| L2 | On activity only | Update on task start/complete |
| L3-L5 | No heartbeat (ephemeral/short-lived) | — |

### 10.3 Smart Routing via Health Data

L0 checks `HEARTBEAT-STATUS.md` of target L1 before dispatching:
- If **healthy + available** → dispatch normally
- If **degraded** → dispatch with warning, or find alternate route
- If **overloaded** → queue, wait, or handle directly at L0
- If **error** → escalate to sysadmin for investigation

---

## 11. Agent Discovery via ClawHub

Support **pre-packaged agent blueprints** installable from ClawHub — one-command agent provisioning.

### 11.1 Blueprint Package Structure

```
clawhub-agent-<name>/
├── SKILL.md              # ClawHub skill metadata
├── blueprint/
│   ├── AGENT-MANIFEST.md # Pre-written manifest
│   ├── SOUL.md           # Pre-written persona
│   ├── AGENTS.md         # Pre-written sub-agent registry
│   ├── IDENTITY.md       # Pre-written identity
│   ├── USER.md           # Template (customized on install)
│   └── TOOLS.md          # Pre-written tool notes
├── config-patch.json     # JSON patch for openclaw.json
└── install.md            # Installation instructions for sysadmin
```

### 11.2 Installation Flow

```
1. User: "Install a research sub-system"
2. L0 routes to sysadmin
3. Sysadmin runs: clawhub search agent-research
4. Sysadmin runs: clawhub install agent-research-team
5. Blueprint files copied to new workspace
6. config-patch.json merged into openclaw.json via safe-config
7. Main AGENTS.md updated
8. Gateway restart
9. Test task dispatched to verify
```

### 11.3 Publishing an Agent Blueprint

```
1. sysadmin packages workspace files + config into blueprint format
2. Sensitive data (API keys, personal info) stripped
3. Published to ClawHub: clawhub publish agent-<name>
4. Other OpenClaw users can install with one command
```

### 11.4 Versioning

Blueprints follow semver. `clawhub update agent-<name>` upgrades workspace files while preserving user customizations (USER.md, TOOLS.md, projects/).

---

## 12. Result Caching Layer

Prevents redundant work across branches and sessions.

### 12.1 Cache Location

```
/root/.openclaw/workspace/shared/cache/
├── index.json            # Cache registry with keys, TTLs, metadata
└── entries/
    ├── <hash>.md         # Cached result (markdown)
    ├── <hash>.json       # Cached result (structured data)
    └── ...
```

### 12.2 Cache Entry Format

```json
{
  "key": "<descriptive-key>",
  "query": "<original question or task>",
  "result": "<file path to cached result>",
  "createdBy": "<agent-id>",
  "createdAt": "<ISO timestamp>",
  "ttl": "<duration — e.g., 1h, 24h, 7d, permanent>",
  "expiresAt": "<ISO timestamp>",
  "tags": ["<domain>", "<topic>"],
  "hitCount": 0
}
```

### 12.3 Cache Protocol

**Before dispatching a task**, the dispatching agent:
1. Checks `shared/cache/index.json` for a matching key or similar query
2. If **cache hit** and **not expired** → return cached result, skip delegation
3. If **cache miss** or **expired** → dispatch normally, then cache the result

**Cache write rules:**
- Only L0, L1, and L2 agents can write to shared cache
- L3-L5 return results to their parent, who decides whether to cache
- Default TTL by type:
  - Facts/research: 24h
  - Computed results: 1h
  - Static reference data: 7d
  - User-marked permanent: no expiry

### 12.4 Cache Invalidation

- **TTL-based**: Auto-expires
- **Manual**: Any L0-L2 agent can invalidate by key
- **Cascade**: When an L1-D is uninstalled, its cache entries are purged

---

## 13. Observability Dashboard (STATUS.md)

A live, auto-updated dashboard showing org health at a glance.

### 13.1 Location

```
/root/.openclaw/workspace/STATUS.md
```

### 13.2 Format

```markdown
# 🏛️ System Status Dashboard
**Last Updated**: 2026-03-02T12:30:00+08:00

## Org Health: 🟢 Healthy

## Agent Tree
| | Agent | Layer | Status | Active | Last Activity |
|---|-------|-------|--------|--------|---------------|
| 🟢 | All-for-One (main) | L0 | healthy | 1 task | 2 min ago |
| 🟢 | System Admin | L1-C | idle | 0 tasks | 1 hr ago |
| ⚪ | Full Power | L1-C | standby | — | — |
| 🟢 | Travel Planner | L1-D | healthy | 2 tasks | 5 min ago |

## Model Usage (Today)
| Tier | Tokens In | Tokens Out | Est. Cost |
|------|-----------|------------|-----------|
| Tier-1 | 12,400 | 3,200 | $0.48 |
| Tier-2 | 45,000 | 18,000 | $0.35 |
| Tier-3 | 120,000 | 42,000 | $0.12 |
| **Total** | **177,400** | **63,200** | **$0.95** |

## Cache
- Entries: 14
- Hit rate (24h): 67%
- Oldest: 6h ago
- Next expiry: in 18 min

## Recent Events
- 12:28 — Travel Planner completed "Paris hotel research"
- 12:15 — Cache hit: "HKG→CDG flight prices" (saved ~$0.08)
- 11:50 — System Admin: healthcheck passed ✅

## Alerts
(none)
```

### 13.3 Update Mechanism

- **L0** aggregates heartbeat data from all L1 agents on each heartbeat cycle
- Reads each L1's `HEARTBEAT-STATUS.md`
- Compiles into `STATUS.md`
- Can also be triggered on-demand: "Show me system status"

### 13.4 Canvas Visualization (Optional)

`STATUS.md` can be rendered as a **canvas** for visual display:
- Org chart with color-coded health indicators
- Real-time task flow visualization
- Triggered via: "Show me the org chart"

---

## 14. Graceful Degradation Rules

The system must stay functional when parts fail. No single point of failure (except L0, which is the platform itself).

### 14.1 Model Provider Outage

```
Degradation Chain:
  Tier-1 unavailable → All Tier-1 agents temporarily use Tier-2
  Tier-2 unavailable → All Tier-2 agents temporarily use Tier-3
  Tier-3 unavailable → All Tier-3 agents temporarily use Tier-4
  Tier-4 unavailable → Agent pauses, escalates to parent
  All tiers unavailable → L0 notifies user, enters manual mode
```

### 14.2 Fallback Configuration

Each agent declares fallback models in `openclaw.json`:

```json
{
  "model": {
    "primary": "openrouter/anthropic/claude-opus-4.6",
    "fallbacks": [
      "openrouter/anthropic/claude-sonnet-4.6",
      "openrouter/google/gemini-3.1-pro-preview",
      "openrouter/google/gemini-3-flash-preview"
    ]
  }
}
```

Fallback order = tier order. The system auto-selects the next available.

### 14.3 Agent-Level Failure

| Scenario | Response |
|----------|----------|
| L1-D fails | L0 handles task directly (reduced quality) + alerts user + sysadmin investigates |
| L2 fails | L1 handles task directly + logs warning |
| L3-L5 fails | Parent retries once, then escalates |
| sysadmin fails | L0 alerts user immediately — critical failure |
| full-power fails | L0 alerts user — non-critical (only used on explicit command) |

### 14.4 Degraded Mode Indicators

When running in degraded mode, the agent adds a header:

```
⚠️ [DEGRADED] Running on Tier-2 fallback (Tier-1 provider unavailable)
```

### 14.5 Auto-Recovery

- Each heartbeat cycle checks if previously-failed providers are back
- When recovered: auto-restore to primary model, log recovery event
- No manual intervention needed for transient outages

---

## 15. Sub-System Installation Protocol

### Install a new Department (L1-D)

**Option A: Manual provisioning via sysadmin**
```
1. User tells L0: "I want a <domain> sub-system"
2. L0 routes to sysadmin (L1-C)
3. Sysadmin:
   a. Creates workspace: /root/.openclaw/workspace-<agent-id>/
   b. Writes AGENT-MANIFEST.md (from template)
   c. Writes SOUL.md (persona + rules + layer awareness)
   d. Writes AGENTS.md (empty sub-agent registry)
   e. Writes USER.md, TOOLS.md, IDENTITY.md
   f. Adds agent to openclaw.json via safe-config
   g. Updates main's AGENTS.md registry
   h. Gateway restart
4. L0 routes a test task to verify
```

**Option B: ClawHub blueprint install**
```
1. User: "Install a research sub-system"
2. L0 routes to sysadmin
3. Sysadmin: clawhub search agent-research → clawhub install agent-research-team
4. Blueprint auto-provisions workspace + config
5. Gateway restart
6. Test task dispatched
```

### Install a Specialist (L2/L3) under an existing Department
```
1. User or L1-D requests a specialist
2. L1-D (or sysadmin) provisions the sub-agent
3. L1-D updates its own AGENTS.md
4. Main AGENTS.md updated
```

### Uninstall
```
1. Remove sub-agents recursively (bottom-up)
2. Remove from openclaw.json agents.list[]
3. Remove from parent's AGENTS.md
4. Remove from main's AGENTS.md
5. Purge cache entries for this agent
6. Archive workspace (never delete — preserve history)
7. Gateway restart
```

---

## 16. Workspace Standard

Every agent workspace:
```
/root/.openclaw/workspace-<agent-id>/
├── SOUL.md              # Persona, rules, layer awareness
├── AGENTS.md            # Sub-agent registry (if any)
├── AGENT-MANIFEST.md    # Self-declaration
├── USER.md              # User context
├── TOOLS.md             # Agent-specific tool notes
├── IDENTITY.md          # Name, emoji, avatar
├── HEARTBEAT-STATUS.md  # Health report (L0-L2 only)
└── projects/            # Working directory
```

Main workspace adds:
```
/root/.openclaw/workspace/
├── (all standard files)
├── ARCHITECTURE.md      # This document (living reference)
├── STATUS.md            # Live org dashboard
├── shared/
│   ├── cache/           # Result cache
│   │   ├── index.json
│   │   └── entries/
│   └── artifacts/       # Cross-department file exchange
└── templates/           # Provisioning templates
    ├── SOUL-template.md
    ├── MANIFEST-template.md
    └── AGENTS-template.md
```

---

## 17. Task Affinity & Context Continuity

When a parent delegates a task to a child agent, the parent **must track that delegation** so that follow-up messages on the same topic route back to the same child — preserving context continuity.

### 17.1 Recent Delegations Log

Every dispatching agent (L0–L4) maintains a mental log of recent delegations within the current conversation thread:

```
Recent Delegations (current thread):
- [<timestamp>] <child-id> — <topic summary> — Status: <active|completed>
```

This is tracked **in-context** (within the agent's conversation memory), not as a separate file. The agent simply remembers: "I sent this topic to that child."

### 17.2 Affinity Rules

Before routing a new request, the dispatching agent applies these rules **in order**:

1. **Topic Match**: Does the new request relate to a topic recently delegated to a child?
   - Check for: same subject, follow-up questions, "tell me more", references to prior results
   - If YES → **re-dispatch to the same child** with the follow-up context
   
2. **Explicit Reference**: Does the user reference something a child previously returned?
   - e.g., "What's the detail of that email?" after a child found the email
   - If YES → **re-dispatch to that child**

3. **Recency Window**: Affinity applies within the current conversation thread. If the conversation topic clearly shifts to an unrelated domain, affinity resets.

4. **Completed vs Active**: Even if a child's task is "completed", follow-ups on the same topic still route to that child — the child has the context.

### 17.3 Affinity in Delegation Protocol

When re-dispatching a follow-up to the same child, include a continuity marker:

```
[TASK FROM: <parent-id> (L<n>) → <child-id> (L<n+1>)]
Continuity: follow-up (related to previous task)
Goal: <the follow-up question or action>
Context: <reference to prior result — e.g., "You previously found email titled 'testing'">
Constraints: <any new constraints>
Output Format: <what to return>
Depth: <current depth>
```

The `Continuity: follow-up` marker tells the child this is a continuation, not a fresh task.

### 17.4 Example

```
User: "Check if I have new email"
L0 → dispatches to full-power → full-power finds email "testing" → returns result
L0 remembers: [full-power — email check — found "testing"]

User: "What's the detail of testing?"
L0 checks recent delegations → topic matches "email / testing" → full-power has context
L0 → re-dispatches to full-power with Continuity: follow-up
full-power already has context → inspects the email → returns details
```

Without affinity, L0 would handle "What's the detail of testing?" itself — losing the child's context.

---

## 18. Routing Logic (Orchestrator Algorithm)

```
RECEIVE request from user

0. CHECK AFFINITY — does this relate to a recent delegation?
     → Scan recent delegations for topic match or explicit reference
     → IF match found → RE-DISPATCH to same child with Continuity: follow-up
     → DONE

1. IF "full power" explicit command:
     → DISPATCH to full-power (L1-C)

2. IF infrastructure / config / agent management:
     → DISPATCH to sysadmin (L1-C)

3. IF simple (Q&A, web search, quick CLI):
     → HANDLE directly at L0

4. IF matches installed domain:
     → CHECK cache for existing result
     → IF cache hit → RETURN cached result
     → CHECK target L1-D health via HEARTBEAT-STATUS.md
     → IF healthy → DISPATCH with task protocol
     → IF degraded → DISPATCH with warning
     → IF unavailable → HANDLE at L0 (degraded mode)
     → AWAIT result → CACHE if cacheable → RETURN

5. IF spans multiple domains:
     → DECOMPOSE into domain-specific sub-tasks
     → CHECK cache for each sub-task
     → DISPATCH uncached sub-tasks to L1-Ds in parallel
     → AWAIT all → CACHE → SYNTHESIZE → RETURN

6. IF no matching domain:
     → HANDLE directly at L0
     → SUGGEST creating a new L1-D

RECORD delegation in recent delegations log (agent, topic, timestamp)
UPDATE STATUS.md after each routing decision
```

Each L1-D internally applies the same pattern (including affinity checks) for its own sub-agents.

---

## 19. Governance Rules

| Rule | Description |
|------|-------------|
| **Single Root** | One L0 per installation. Always. |
| **Core Immutability** | L1-C agents cannot be uninstalled via normal flow. |
| **6-Layer Max** | L0 → L1 → L2 → L3 → L4 → L5. L5 never spawns children. |
| **No Lateral Shortcuts** | Cross-branch communication through nearest common ancestor. |
| **Tier Inheritance** | Children inherit or downgrade model tier. Never upgrade. |
| **Fail-Up** | Failed agents escalate to parent. Never fail silently. |
| **Degrade, Don't Die** | Model outages trigger fallback chains, not hard failures. |
| **Language Inheritance** | Sub-agents inherit user's language preference unless overridden. |
| **Depth Tracking** | Every delegation includes current depth counter. Refuse at L5. |
| **Budget Cascade** | L0 sets budget constraints. Cascades down, tightens at each level. |
| **Ephemeral Cleanup** | L5 workers auto-terminate after task. No lingering sessions. |
| **Cache Before Dispatch** | Always check shared cache before delegating a task. |
| **Observable Always** | STATUS.md must reflect current org state at all times. |

---

## 20. What This Architecture Does NOT Define

- ❌ Which domains/departments to install
- ❌ How many agents you need (min 3, max unlimited)
- ❌ Specific model choices (just tiers)
- ❌ Business logic of any sub-system
- ❌ External integrations (those are agent-specific)

---

## 21. Summary

| Aspect | Answer |
|--------|--------|
| Pre-installed agents | **3** (main, sysadmin, full-power) |
| Max hierarchy depth | **6 layers** (L0–L5) |
| How to add a domain? | Install L1-D via sysadmin or ClawHub |
| Portable? | **Yes** — zero domain assumptions |
| Recursive sub-agents? | **Yes** — any agent L0–L4 can spawn children |
| Model strategy | **4-tier system** — mapped per installation |
| Cost control | **Tier inheritance** — children never exceed parent |
| Resilience | **Graceful degradation** — fallback chains, never hard-fail |
| Observability | **STATUS.md** — live dashboard, auto-updated |
| Cache | **Shared cache** — prevents redundant delegation |
| Ecosystem | **ClawHub blueprints** — one-command agent install |
| Health monitoring | **Heartbeat protocol** — smart routing based on agent load |
| Context continuity | **Task affinity** — follow-ups route to the same child agent |

---

*Architecture v2.2 — Last updated: 2026-03-02*
