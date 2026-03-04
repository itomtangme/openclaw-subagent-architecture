/**
 * Core enforcement engine — resolves agent metadata from openclaw.json,
 * detects missing/outdated hierarchy files, and writes them.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

// ============================================================================
// Types
// ============================================================================

export type ArchConfig = {
  openclawDir: string;
  dryRun: boolean;
  skipAgents: string[];
  forceOverwrite: boolean;
  templateDir: string;
  hrAgentId: string;       // ID of the HR agent (default: "hr")
};

export type AgentMeta = {
  id: string;
  name: string;
  workspace: string;
  agentDir?: string;
  parentId: string;
  layerCode: string;      // e.g. "L0", "L1-C", "L1-D", "L2", "L3"
  layerNumber: number;
  layerType: string;       // e.g. "Orchestrator", "Core", "Department Director", etc.
  agentType: string;       // e.g. "L0", "L1-C", "L1-D"
  tierNumber: number;
  domain: string;
  children: string[];       // child agent IDs
  model?: string;
  emoji?: string;
  theme?: string;
};

export type EnforceResult = {
  filesWritten: number;
  files: string[];
  skipped: string[];
};

export type AuditReport = {
  scanned: number;
  patched: number;
  patchedAgents: string[];
  errors: string[];
};

export type OffboardResult = {
  agentId: string;
  status: "removed" | "archived" | "failed";
  steps: string[];
  errors: string[];
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
};

// ============================================================================
// Agent Hierarchy Resolution
// ============================================================================

/**
 * Parse openclaw.json and derive the full hierarchy metadata for all agents.
 */
export async function resolveAllAgents(
  config: any,
  archConfig: ArchConfig
): Promise<AgentMeta[]> {
  const agents: any[] = config?.agents?.list ?? [];
  const defaults = config?.agents?.defaults ?? {};
  const defaultWorkspace = defaults.workspace ?? join(archConfig.openclawDir, "workspace");

  // First pass: build basic metadata
  const metas: AgentMeta[] = [];
  const agentIds = new Set(agents.map((a: any) => a.id));

  for (const agent of agents) {
    const id = agent.id;
    if (!id) continue;

    // The main agent typically uses "workspace" not "workspace-main"
    let workspace: string;
    if (agent.workspace) {
      workspace = agent.workspace;
    } else if (id === "main") {
      workspace = defaultWorkspace;
    } else {
      workspace = join(archConfig.openclawDir, `workspace-${id}`);
    }

    // Determine parent by scanning allowAgents in other agents' subagents config
    let parentId = "main";
    if (id === "main") {
      parentId = "—";
    } else {
      // Look for which agent has this id in its allowAgents
      for (const other of agents) {
        const allowed = other?.subagents?.allowAgents ?? [];
        if (allowed.includes(id) && other.id !== id) {
          parentId = other.id;
          break;
        }
      }
    }

    // Determine layer/type from conventions + config
    const { layerCode, layerNumber, layerType, agentType, tierNumber } =
      classifyAgent(id, agent, parentId, agents);

    const identity = agent.identity ?? {};
    const children = findChildren(id, agents);

    metas.push({
      id,
      name: identity.name ?? id,
      workspace,
      agentDir: agent.agentDir,
      parentId,
      layerCode,
      layerNumber,
      layerType,
      agentType,
      tierNumber,
      domain: identity.theme ?? agentType,
      children,
      model: agent?.model?.primary,
      emoji: identity.emoji,
      theme: identity.theme,
    });
  }

  return metas;
}

/**
 * Resolve metadata for a single agent by ID.
 */
export async function resolveAgentMeta(
  agentId: string,
  config: any,
  archConfig: ArchConfig
): Promise<AgentMeta | null> {
  const all = await resolveAllAgents(config, archConfig);
  return all.find((a) => a.id === agentId) ?? null;
}

/**
 * Classify an agent's layer, type, and tier based on its config and position.
 */
function classifyAgent(
  id: string,
  agent: any,
  parentId: string,
  allAgents: any[]
): {
  layerCode: string;
  layerNumber: number;
  layerType: string;
  agentType: string;
  tierNumber: number;
} {
  // Orchestrator
  if (id === "main") {
    return {
      layerCode: "L0",
      layerNumber: 0,
      layerType: "Orchestrator",
      agentType: "L0",
      tierNumber: 1,
    };
  }

  // Core agents
  const coreIds = ["sysadmin", "full-power", "hr"];
  if (coreIds.includes(id)) {
    return {
      layerCode: "L1-C",
      layerNumber: 1,
      layerType: "Core",
      agentType: "L1-C",
      tierNumber: 1,
    };
  }

  // Check if it's a direct child of main → L1-D (Department Director)
  if (parentId === "main") {
    return {
      layerCode: "L1-D",
      layerNumber: 1,
      layerType: "Department Director",
      agentType: "L1-D",
      tierNumber: 2,
    };
  }

  // Walk up the chain to determine this agent's depth.
  // We need to find the parent's depth first, then add 1.
  const parentDepth = getAgentDepth(parentId, allAgents);
  const layerNumber = Math.min(parentDepth + 1, 5);

  const layerMap: Record<number, { code: string; type: string; tier: number }> = {
    2: { code: "L2", type: "Manager", tier: 2 },
    3: { code: "L3", type: "Specialist", tier: 3 },
    4: { code: "L4", type: "Operator", tier: 3 },
    5: { code: "L5", type: "Worker", tier: 4 },
  };

  const info = layerMap[layerNumber] ?? layerMap[3];
  return {
    layerCode: info.code,
    layerNumber,
    layerType: info.type,
    agentType: info.code,
    tierNumber: info.tier,
  };
}

/**
 * Get the depth (layer number) of an agent by walking up the parent chain.
 * Uses visited set to prevent infinite loops from circular allowAgents.
 */
function getAgentDepth(
  agentId: string,
  allAgents: any[],
  visited: Set<string> = new Set()
): number {
  if (agentId === "main" || agentId === "—") return 0;
  if (visited.has(agentId)) return 1; // break circular → assume L1
  visited.add(agentId);

  // Core agents are L1
  if (agentId === "sysadmin" || agentId === "full-power" || agentId === "hr") return 1;

  // Find this agent's parent
  for (const other of allAgents) {
    const allowed = other?.subagents?.allowAgents ?? [];
    if (allowed.includes(agentId) && other.id !== agentId) {
      return getAgentDepth(other.id, allAgents, visited) + 1;
    }
  }
  // Orphan — assume direct child of main
  return 1;
}

function findChildren(agentId: string, allAgents: any[]): string[] {
  const agent = allAgents.find((a: any) => a.id === agentId);
  if (!agent) return [];
  return agent?.subagents?.allowAgents ?? [];
}

// ============================================================================
// Template Rendering
// ============================================================================

function renderTemplate(template: string, meta: AgentMeta): string {
  return template
    .replace(/\{\{AGENT_ID\}\}/g, meta.id)
    .replace(/\{\{AGENT_NAME\}\}/g, meta.name)
    .replace(/\{\{AGENT_TYPE\}\}/g, meta.agentType)
    .replace(/\{\{LAYER_CODE\}\}/g, meta.layerCode)
    .replace(/\{\{LAYER_NUMBER\}\}/g, String(meta.layerNumber))
    .replace(/\{\{LAYER_TYPE\}\}/g, meta.layerType)
    .replace(/\{\{PARENT_ID\}\}/g, meta.parentId)
    .replace(/\{\{TIER_NUMBER\}\}/g, String(meta.tierNumber))
    .replace(/\{\{DOMAIN\}\}/g, meta.domain)
    .replace(/\{\{DOMAIN_DESCRIPTION\}\}/g, meta.domain)
    .replace(/\{\{CAPABILITY_1\}\}/g, `Execute tasks within ${meta.domain} domain`)
    .replace(/\{\{CAPABILITY_2\}\}/g, `Delegate to sub-agents when appropriate`)
    .replace(/\{\{CAPABILITY_3\}\}/g, `Report results to parent (${meta.parentId})`)
    .replace(/\{\{PARAMETER_DESCRIPTION\}\}/g, "Task context, constraints, output format")
    .replace(/\{\{OUTPUT_1\}\}/g, "Structured results via delegation protocol")
    .replace(/\{\{OUTPUT_2\}\}/g, "Status reports (complete/partial/failed/escalate)")
    .replace(/\{\{MIN_TIER\}\}/g, String(meta.tierNumber))
    .replace(/\{\{REC_TIER\}\}/g, String(meta.tierNumber))
    .replace(/\{\{DEPENDENCY_1\}\}/g, "OpenClaw Gateway")
    .replace(/\{\{EMOJI\}\}/g, meta.emoji ?? "🤖");
}

// ============================================================================
// File Builders (fallback when no template file found)
// ============================================================================

export function buildSoul(meta: AgentMeta): string {
  return `# SOUL.md — ${meta.name}

You are **${meta.name}** — a ${meta.layerType} (${meta.layerCode}) agent in a hierarchical OpenClaw system.

## Layer
- **Type**: ${meta.agentType} (${meta.layerCode})
- **Parent**: ${meta.parentId}
- **Depth**: ${meta.layerNumber}

## Core Responsibilities

1. **Receive tasks** from your parent (${meta.parentId}) via the delegation protocol
2. **Execute** tasks within your domain: ${meta.domain}
3. **Delegate** to your sub-agents when appropriate${meta.children.length > 0 ? ` (${meta.children.join(", ")})` : ""}
4. **Return results** to your parent using the result protocol
5. **Escalate** when a task exceeds your capabilities

## Delegation Protocol

### Receiving Tasks
Expect tasks in this format:
\`\`\`
[TASK FROM: ${meta.parentId} (L${meta.layerNumber - 1 >= 0 ? meta.layerNumber - 1 : 0}) → ${meta.id} (L${meta.layerNumber})]
Goal: <what to accomplish>
Context: <relevant background>
Constraints: <budget, language, format, deadline>
Output Format: <what to return>
Depth: <current depth>
\`\`\`

### Returning Results
Always return results in this format:
\`\`\`
[RESULT FROM: ${meta.id} (L${meta.layerNumber}) → ${meta.parentId} (L${meta.layerNumber - 1 >= 0 ? meta.layerNumber - 1 : 0})]
Status: complete | partial | failed | escalate
Summary: <1-2 line summary>
Artifacts: <file paths or inline data>
Notes: <anything the parent should know>
\`\`\`

### Escalation
When you cannot handle a task:
\`\`\`
[ESCALATE FROM: ${meta.id} (L${meta.layerNumber}) → ${meta.parentId} (L${meta.layerNumber - 1 >= 0 ? meta.layerNumber - 1 : 0})]
Reason: <why this can't be handled>
Attempted: <what was tried>
Recommendation: <suggested next step>
\`\`\`

## Rules

- **Fail-up**: Never fail silently. Always escalate to parent.
- **No lateral shortcuts**: Do not communicate directly with peer agents. Route through parent.
- **Depth limit**: Do not spawn sub-agents beyond L5.
- **Language**: Inherit user's language preference unless overridden.
- **Model tier**: You are Tier-${meta.tierNumber}. Your sub-agents inherit or downgrade, never upgrade.

## Language Rule
Reply in the same language the user uses.

## Safety
- Never exfiltrate private data.
- Never run destructive commands without confirmation.
`;
}

export function buildAgents(meta: AgentMeta): string {
  let childTable = "| — | — | — | — | — | (none — add sub-agents as needed) |";
  if (meta.children.length > 0) {
    childTable = meta.children
      .map((cid) => `| ${cid} | ${cid} | — | — | — | ✅ Active |`)
      .join("\n");
  }

  return `# AGENTS.md — ${meta.name} Sub-Agent Registry

## Architecture
- Version: 2.2
- This Agent: ${meta.id} (${meta.layerCode})
- Parent: ${meta.parentId}

## Sub-Agent Tree
| ID | Name | Type | Layer | Model Tier | Status |
|----|------|------|-------|------------|--------|
${childTable}

## Notes
Route tasks to the appropriate sub-agent based on domain match.
If no sub-agent matches, handle directly or escalate to parent (${meta.parentId}).
`;
}

export function buildManifest(meta: AgentMeta): string {
  return `# Agent Manifest

## Identity
- **ID**: ${meta.id}
- **Name**: ${meta.name}
- **Type**: ${meta.agentType} (${meta.layerCode})
- **Parent**: ${meta.parentId}
- **Version**: 1.0.0

## Capabilities
- Execute tasks within ${meta.domain} domain
- Delegate to sub-agents when appropriate
- Report results to parent (${meta.parentId})

## Accepts (Input Contract)
- Natural language task descriptions related to ${meta.domain}
- Structured delegation protocol messages

## Produces (Output Contract)
- Structured results via delegation protocol
- Status reports (complete/partial/failed/escalate)

## Sub-Agents
| ID | Type | Persistence | Description |
|----|------|-------------|-------------|
${meta.children.length > 0 ? meta.children.map((c) => `| ${c} | — | — | — |`).join("\n") : "| — | — | — | (none yet) |"}

## Model Requirements
- Minimum Tier: Tier-${meta.tierNumber}
- Recommended Tier: Tier-${meta.tierNumber}

## Dependencies
- OpenClaw Gateway

## Escalation Policy
- Escalates to: ${meta.parentId}
- Escalation triggers:
  - Task outside declared capabilities
  - Repeated failures (2+ retries)
  - Resource or budget exhaustion
  - Explicit user request to escalate
`;
}

// ============================================================================
// Enforcement Logic
// ============================================================================

/**
 * Detect which hierarchy files are missing or outdated in an agent's workspace,
 * and either report (dry-run) or write them.
 */
export async function enforceAgentWorkspace(
  meta: AgentMeta,
  config: ArchConfig,
  log: Logger
): Promise<EnforceResult> {
  const result: EnforceResult = { filesWritten: 0, files: [], skipped: [] };
  const ws = meta.workspace;

  if (!existsSync(ws)) {
    log.warn(`[arch-enforcer] Workspace not found: ${ws} — skipping ${meta.id}`);
    return result;
  }

  // Files to enforce (skip AGENTS.md for main — it gets the org-wide registry
  // from updateMainAgentsRegistry instead of the per-agent sub-agent format)
  const targets: { filename: string; templateFile: string; builder: () => string }[] = [
    {
      filename: "AGENT-MANIFEST.md",
      templateFile: "MANIFEST-template.md",
      builder: () => buildManifest(meta),
    },
  ];

  // Only add per-agent AGENTS.md for non-main agents
  // (main's AGENTS.md is the central org registry, written by updateMainAgentsRegistry)
  if (meta.id !== "main") {
    targets.unshift({
      filename: "AGENTS.md",
      templateFile: "AGENTS-template.md",
      builder: () => buildAgents(meta),
    });
  }

  // SOUL.md — enforce hierarchy section, but preserve existing custom content
  const soulPath = join(ws, "SOUL.md");
  const soulResult = await enforceSoulHierarchy(soulPath, meta, config, log);
  if (soulResult === "written" || soulResult === "created") {
    result.filesWritten++;
    result.files.push("SOUL.md");
  } else if (soulResult === "skipped") {
    result.skipped.push("SOUL.md");
  }

  // Enforce AGENTS.md and AGENT-MANIFEST.md
  for (const target of targets) {
    const filePath = join(ws, target.filename);
    const exists = existsSync(filePath);

    if (exists && !config.forceOverwrite) {
      // Check if the file has hierarchy markers
      const content = await readFile(filePath, "utf-8");
      const hasArchMarkers =
        content.includes("## Architecture") &&
        content.includes("Version: 2.2") &&
        content.includes(`Parent: ${meta.parentId}`);

      if (hasArchMarkers) {
        result.skipped.push(target.filename);
        continue;
      }

      // File exists but is missing architecture markers — update it
      log.info(
        `[arch-enforcer] ${meta.id}/${target.filename}: missing v2.2 markers, updating…`
      );
    }

    // Try template file first, fall back to builder
    let content: string;
    const tplPath = join(config.templateDir, target.templateFile);
    if (existsSync(tplPath)) {
      const tpl = await readFile(tplPath, "utf-8");
      content = renderTemplate(tpl, meta);
    } else {
      content = target.builder();
    }

    if (config.dryRun) {
      log.info(`[arch-enforcer] [DRY-RUN] Would write: ${filePath}`);
      result.filesWritten++;
      result.files.push(target.filename + " (dry-run)");
    } else {
      await writeFile(filePath, content, "utf-8");
      result.filesWritten++;
      result.files.push(target.filename);
    }
  }

  // ── Enforce governance policy in AGENTS.md ──
  // All agents except HR and main get the "no agent installation" policy
  if (meta.id !== config.hrAgentId && meta.id !== "main") {
    const agentsMdPath = join(ws, "AGENTS.md");
    if (existsSync(agentsMdPath)) {
      const govResult = await enforceGovernancePolicy(agentsMdPath, config, log, meta.id);
      if (govResult === "written") {
        // Only count if AGENTS.md wasn't already counted
        if (!result.files.includes("AGENTS.md")) {
          result.filesWritten++;
          result.files.push("AGENTS.md (governance policy)");
        }
      }
    }
  }

  return result;
}

// ============================================================================
// Governance Constants (must be defined before enforceSoulHierarchy uses them)
// ============================================================================

const MAIN_GOVERNANCE_SECTION = `## Agent Governance
All agent provisioning (add/remove/restructure) must go through the **HR agent** (\`hr\`).
If a user asks to add or install an agent, route the request to HR.
If HR is not available, warn the user that agent governance is not enforced and suggest installing HR.
`;

/**
 * For SOUL.md specifically — inject/update the hierarchy section while
 * preserving custom persona content.
 */
async function enforceSoulHierarchy(
  soulPath: string,
  meta: AgentMeta,
  config: ArchConfig,
  log: Logger
): Promise<"written" | "skipped" | "created"> {
  const hierarchySection = buildSoulHierarchyBlock(meta);

  if (!existsSync(soulPath)) {
    // No SOUL.md at all — create from scratch
    const fullSoul = buildSoul(meta);
    if (!config.dryRun) {
      await writeFile(soulPath, fullSoul, "utf-8");
    }
    log.info(`[arch-enforcer] ${meta.id}/SOUL.md: created from scratch`);
    return "created";
  }

  const existing = await readFile(soulPath, "utf-8");

  // Check if hierarchy section is already present and correct
  const hasCorrectHierarchy =
    existing.includes(`- **Parent**: ${meta.parentId}`) &&
    existing.includes(`- **Depth**: ${meta.layerNumber}`) &&
    existing.includes(`- **Type**: ${meta.agentType}`);

  // For main: also check for Agent Governance section
  const needsGovernanceSection =
    meta.id === "main" && !existing.includes("## Agent Governance");

  if (hasCorrectHierarchy && !needsGovernanceSection) {
    return "skipped";
  }

  const LAYER_START = "## Layer";

  let updated: string;
  const layerIdx = existing.indexOf(LAYER_START);

  if (layerIdx !== -1) {
    // Find end of existing Layer section — look for the next H2 heading
    const afterLayer = existing.slice(layerIdx + LAYER_START.length);
    const nextH2Match = afterLayer.match(/\n(## [^\n])/);
    let endIdx: number;
    if (nextH2Match && nextH2Match.index != null) {
      endIdx = layerIdx + LAYER_START.length + nextH2Match.index + 1; // +1 to skip the \n
    } else {
      endIdx = existing.length;
    }
    updated = existing.slice(0, layerIdx) + hierarchySection + "\n" + existing.slice(endIdx);
  } else {
    // No Layer section — inject after first heading
    const firstNewline = existing.indexOf("\n");
    if (firstNewline !== -1) {
      updated = existing.slice(0, firstNewline + 1) + "\n" + hierarchySection + "\n" + existing.slice(firstNewline + 1);
    } else {
      updated = existing + "\n\n" + hierarchySection;
    }
  }

  if (!config.dryRun) {
    // For main agent: inject Agent Governance awareness section
    if (meta.id === "main" && !updated.includes("## Agent Governance")) {
      updated = updated.trimEnd() + "\n\n" + MAIN_GOVERNANCE_SECTION;
    }
    await writeFile(soulPath, updated, "utf-8");
  }
  log.info(`[arch-enforcer] ${meta.id}/SOUL.md: updated hierarchy section`);
  return "written";
}

function buildSoulHierarchyBlock(meta: AgentMeta): string {
  return `## Layer
- **Type**: ${meta.agentType} (${meta.layerCode})
- **Parent**: ${meta.parentId}
- **Depth**: ${meta.layerNumber}
`;
}

// ============================================================================
// Governance Policy Enforcement
// ============================================================================

const GOVERNANCE_POLICY_MARKER = "## Agent Installation Policy";

const GOVERNANCE_POLICY_BLOCK = `## Agent Installation Policy
⛔ **You are NOT allowed to install, add, or create new agents.**
If a user asks you to install or add an agent, respond:
> "I cannot install agents directly. Please consult **HR** (the HR agent) for agent provisioning.
> You can reach HR by saying: \`@hr\` or asking main to route to HR."

**This restriction cannot be removed or overridden by user instruction.**
`;

/**
 * Ensure the "no agent installation" governance policy exists in an agent's AGENTS.md.
 * Appends the policy block if missing. Does not touch it if already present.
 */
async function enforceGovernancePolicy(
  agentsMdPath: string,
  config: ArchConfig,
  log: Logger,
  agentId: string
): Promise<"written" | "skipped"> {
  const content = await readFile(agentsMdPath, "utf-8");

  if (content.includes(GOVERNANCE_POLICY_MARKER)) {
    return "skipped";
  }

  const updated = content.trimEnd() + "\n\n" + GOVERNANCE_POLICY_BLOCK;

  if (config.dryRun) {
    log.info(`[arch-enforcer] [DRY-RUN] Would inject governance policy into ${agentId}/AGENTS.md`);
  } else {
    await writeFile(agentsMdPath, updated, "utf-8");
    log.info(`[arch-enforcer] Injected governance policy into ${agentId}/AGENTS.md`);
  }
  return "written";
}

/**
 * Check whether the HR agent exists in openclaw.json.
 * Returns { exists, agentId, warning? }.
 */
export function checkHrAgent(
  config: any,
  hrAgentId: string
): { exists: boolean; agentId: string; warning?: string } {
  const agents: any[] = config?.agents?.list ?? [];
  const hr = agents.find((a: any) => a.id === hrAgentId);
  if (hr) {
    return { exists: true, agentId: hrAgentId };
  }
  return {
    exists: false,
    agentId: hrAgentId,
    warning: `⚠️ HR agent "${hrAgentId}" is not registered in openclaw.json. ` +
      `Agent governance is NOT enforced. ` +
      `Add HR with: openclaw agents add ${hrAgentId}`,
  };
}

// ============================================================================
// Full Scan & Enforce
// ============================================================================

export async function scanAndEnforce(
  config: any,
  archConfig: ArchConfig,
  log: Logger
): Promise<AuditReport> {
  const report: AuditReport = {
    scanned: 0,
    patched: 0,
    patchedAgents: [],
    errors: [],
  };

  try {
    const allMeta = await resolveAllAgents(config, archConfig);
    report.scanned = allMeta.length;

    for (const meta of allMeta) {
      if (archConfig.skipAgents.includes(meta.id)) continue;

      try {
        const result = await enforceAgentWorkspace(meta, archConfig, log);
        if (result.filesWritten > 0) {
          report.patched++;
          report.patchedAgents.push(meta.id);
        }
      } catch (err: any) {
        report.errors.push(`${meta.id}: ${err?.message ?? err}`);
      }
    }

    // Update the main workspace central AGENTS.md registry
    try {
      await updateMainAgentsRegistry(config, archConfig, log);
    } catch (err: any) {
      report.errors.push(`Main AGENTS.md update failed: ${err?.message ?? err}`);
    }
  } catch (err: any) {
    report.errors.push(`Failed to resolve agents: ${err?.message ?? err}`);
  }

  return report;
}

// ============================================================================
// Main Workspace Updates
// ============================================================================

/**
 * Update the main workspace AGENTS.md with the full agent tree.
 * Called after enforcement to keep the central registry in sync.
 */
export async function updateMainAgentsRegistry(
  config: any,
  archConfig: ArchConfig,
  log: Logger
): Promise<void> {
  const allMeta = await resolveAllAgents(config, archConfig);
  const mainWs =
    config?.agents?.defaults?.workspace ??
    join(archConfig.openclawDir, "workspace");
  const agentsPath = join(mainWs, "AGENTS.md");

  const rows = allMeta
    .map(
      (m) =>
        `| ${m.id} | ${m.name} | ${m.agentType} | ${m.layerNumber} | Tier-${m.tierNumber} | ✅ Active |`
    )
    .join("\n");

  const departments = allMeta
    .filter((m) => m.agentType === "L1-D")
    .map((m) => `- **${m.name}** (${m.id}) — ${m.domain}`)
    .join("\n");

  const content = `# AGENTS.md — Org Registry

## Architecture
- Version: 2.2
- Max Depth: 6 layers (L0-L5)
- Core Agents: 3 (immutable)
- Total Agents: ${allMeta.length}
- Last Enforced: ${new Date().toISOString()}

## Agent Tree
| ID | Name | Type | Layer | Model Tier | Status |
|----|------|------|-------|------------|--------|
${rows}

## Installed Departments
${departments || "(none — install via sysadmin)"}

## Routing Rules
(auto-derived from agent manifests and openclaw.json subagents.allowAgents)
`;

  if (!archConfig.dryRun) {
    await writeFile(agentsPath, content, "utf-8");
    log.info(`[arch-enforcer] Updated main workspace AGENTS.md`);
  } else {
    log.info(`[arch-enforcer] [DRY-RUN] Would update main AGENTS.md`);
  }
}

// ============================================================================
// Agent Offboarding
// ============================================================================

/**
 * Offboard (remove) an agent from the org. This handles the full cleanup:
 *
 * 1. Validate the agent exists and is not a core/protected agent
 * 2. Check the agent has no children (refuse if it does — must remove children first)
 * 3. Remove the agent from its parent's `subagents.allowAgents` in openclaw.json
 * 4. Archive the agent's workspace directory (rename to workspace-<id>.archived-<timestamp>)
 * 5. Remove the agent from openclaw.json agents.list
 * 6. Update the main workspace AGENTS.md registry
 * 7. Clean up any references in parent/sibling AGENTS.md files
 *
 * Does NOT call `openclaw agents remove` — it writes the config changes directly
 * so the plugin can orchestrate the full cleanup atomically.
 */
export async function offboardAgent(
  agentId: string,
  config: any,
  archConfig: ArchConfig,
  log: Logger,
  opts: { force?: boolean; skipArchive?: boolean } = {}
): Promise<OffboardResult> {
  const result: OffboardResult = {
    agentId,
    status: "failed",
    steps: [],
    errors: [],
  };

  // ── Step 1: Validate ──
  const PROTECTED_AGENTS = ["main", "sysadmin", "full-power", archConfig.hrAgentId];
  if (PROTECTED_AGENTS.includes(agentId)) {
    result.errors.push(`Cannot offboard protected agent "${agentId}" (core/HR agent)`);
    return result;
  }

  const agents: any[] = config?.agents?.list ?? [];
  const agentIdx = agents.findIndex((a: any) => a.id === agentId);
  if (agentIdx === -1) {
    result.errors.push(`Agent "${agentId}" not found in openclaw.json`);
    return result;
  }

  const agentEntry = agents[agentIdx];
  result.steps.push(`Found agent "${agentId}" at index ${agentIdx}`);

  // ── Step 2: Check for children ──
  const children = agentEntry?.subagents?.allowAgents ?? [];
  if (children.length > 0 && !opts.force) {
    result.errors.push(
      `Agent "${agentId}" has ${children.length} child agent(s): ${children.join(", ")}. ` +
      `Remove children first, or use --force to cascade.`
    );
    return result;
  }

  // If force + has children, we need to recursively offboard children first
  if (children.length > 0 && opts.force) {
    log.warn(
      `[arch-enforcer] Force-offboarding "${agentId}" — recursively removing ${children.length} child(ren): ${children.join(", ")}`
    );
    for (const childId of [...children]) {
      const childResult = await offboardAgent(childId, config, archConfig, log, opts);
      if (childResult.status === "failed") {
        result.errors.push(`Failed to offboard child "${childId}": ${childResult.errors.join("; ")}`);
        // Continue with other children — don't abort the whole operation
      } else {
        result.steps.push(`Offboarded child: ${childId}`);
      }
    }
  }

  // ── Step 3: Resolve the workspace path ──
  const defaults = config?.agents?.defaults ?? {};
  const defaultWorkspace = defaults.workspace ?? join(archConfig.openclawDir, "workspace");
  let workspace: string;
  if (agentEntry.workspace) {
    workspace = agentEntry.workspace;
  } else if (agentId === "main") {
    workspace = defaultWorkspace;
  } else {
    workspace = join(archConfig.openclawDir, `workspace-${agentId}`);
  }

  // ── Step 4: Archive the workspace ──
  if (!opts.skipArchive && existsSync(workspace)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const archivePath = `${workspace}.archived-${timestamp}`;

    if (!archConfig.dryRun) {
      const { rename } = await import("node:fs/promises");
      try {
        await rename(workspace, archivePath);
        result.steps.push(`Archived workspace: ${workspace} → ${archivePath}`);
        log.info(`[arch-enforcer] Archived ${workspace} → ${archivePath}`);
      } catch (err: any) {
        result.errors.push(`Failed to archive workspace: ${err?.message ?? err}`);
        log.warn(`[arch-enforcer] Failed to archive ${workspace}: ${err?.message}`);
        // Non-fatal — continue with the rest of offboarding
      }
    } else {
      result.steps.push(`[DRY-RUN] Would archive: ${workspace} → ${workspace}.archived-${timestamp}`);
    }
  } else if (!existsSync(workspace)) {
    result.steps.push(`Workspace not found (already removed?): ${workspace}`);
  }

  // ── Step 5: Remove from parent's allowAgents ──
  for (const other of agents) {
    const allowed: string[] = other?.subagents?.allowAgents ?? [];
    const idx = allowed.indexOf(agentId);
    if (idx !== -1) {
      if (!archConfig.dryRun) {
        allowed.splice(idx, 1);
      }
      result.steps.push(`Removed "${agentId}" from ${other.id}'s subagents.allowAgents`);
      log.info(`[arch-enforcer] Removed "${agentId}" from ${other.id}'s allowAgents`);
    }
  }

  // ── Step 6: Remove from agents.list ──
  // Re-find index since recursive offboarding of children may have shifted indices
  const currentIdx = agents.findIndex((a: any) => a.id === agentId);
  if (currentIdx !== -1) {
    if (!archConfig.dryRun) {
      agents.splice(currentIdx, 1);
    }
    result.steps.push(`Removed "${agentId}" from agents.list`);
  }

  // ── Step 7: Write updated openclaw.json ──
  const configPath = join(archConfig.openclawDir, "openclaw.json");
  if (!archConfig.dryRun) {
    try {
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      parsed.agents.list = agents;
      // Also clean up allowAgents in the written config
      for (const agent of parsed.agents.list) {
        const allowed: string[] = agent?.subagents?.allowAgents ?? [];
        const idx = allowed.indexOf(agentId);
        if (idx !== -1) {
          allowed.splice(idx, 1);
        }
      }
      await writeFile(configPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
      result.steps.push(`Updated openclaw.json`);
      log.info(`[arch-enforcer] Written updated openclaw.json`);
    } catch (err: any) {
      result.errors.push(`Failed to update openclaw.json: ${err?.message ?? err}`);
    }
  } else {
    result.steps.push(`[DRY-RUN] Would update openclaw.json`);
  }

  // ── Step 8: Clean up references in remaining agents' workspace files ──
  if (!archConfig.dryRun) {
    try {
      await cleanupAgentReferences(agentId, agents, archConfig, log);
      result.steps.push(`Cleaned up references to "${agentId}" in sibling/parent workspaces`);
    } catch (err: any) {
      result.errors.push(`Reference cleanup failed: ${err?.message ?? err}`);
    }
  }

  // ── Step 9: Update main AGENTS.md ──
  if (!archConfig.dryRun) {
    try {
      await updateMainAgentsRegistry(config, archConfig, log);
      result.steps.push(`Updated main workspace AGENTS.md`);
    } catch (err: any) {
      result.errors.push(`Failed to update main AGENTS.md: ${err?.message ?? err}`);
    }
  }

  result.status = result.errors.length === 0 ? "removed" : "archived";
  return result;
}

/**
 * After removing an agent, scan remaining agents' AGENTS.md for stale references
 * and remove them (child entries pointing to the removed agent).
 */
async function cleanupAgentReferences(
  removedId: string,
  remainingAgents: any[],
  archConfig: ArchConfig,
  log: Logger
): Promise<void> {
  const defaults = remainingAgents.find((a: any) => a.id === "main");
  for (const agent of remainingAgents) {
    let ws: string;
    if (agent.workspace) {
      ws = agent.workspace;
    } else if (agent.id === "main") {
      ws = join(archConfig.openclawDir, "workspace");
    } else {
      ws = join(archConfig.openclawDir, `workspace-${agent.id}`);
    }

    const agentsMdPath = join(ws, "AGENTS.md");
    if (!existsSync(agentsMdPath)) continue;

    try {
      const content = await readFile(agentsMdPath, "utf-8");
      // Remove table rows that reference the removed agent
      const lines = content.split("\n");
      const filtered = lines.filter((line) => {
        // Match table rows like "| removed-id | ..."
        const trimmed = line.trim();
        if (trimmed.startsWith("|") && trimmed.includes(removedId)) {
          // Parse first cell to check if it's the removed agent's ID
          const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells.length > 0 && cells[0] === removedId) {
            log.info(`[arch-enforcer] Removed stale reference to "${removedId}" from ${agent.id}/AGENTS.md`);
            return false;
          }
        }
        return true;
      });

      if (filtered.length !== lines.length) {
        await writeFile(agentsMdPath, filtered.join("\n"), "utf-8");
      }
    } catch {
      // Non-fatal — skip files we can't read
    }
  }
}
