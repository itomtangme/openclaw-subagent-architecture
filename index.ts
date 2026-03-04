/**
 * OpenClaw Architecture Enforcer Plugin
 *
 * Lifecycle-aware plugin that automatically enforces the hierarchical
 * multi-agent architecture (v2.2) whenever agents are added, spawned,
 * or the gateway starts. It:
 *
 * 1. On gateway_start — scans all agent workspaces and patches missing/outdated
 *    hierarchy files (SOUL.md, AGENTS.md, AGENT-MANIFEST.md).
 * 2. On subagent_spawned — patches the new child agent's workspace in real-time.
 * 3. Registers CLI sub-commands via `api.registerCli()` for manual audit/enforce
 *    runs (available when the OpenClaw runtime supports `plugins cli` routing).
 * 4. Provides a `/enforce` slash-command for on-demand enforcement.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  scanAndEnforce,
  enforceAgentWorkspace,
  resolveAgentMeta,
  checkHrAgent,
  offboardAgent,
  type ArchConfig,
} from "./src/enforcer.ts";

// ============================================================================
// Plugin Definition
// ============================================================================

export default function architectureEnforcerPlugin(api: OpenClawPluginApi) {
  const log = api.logger;
  const config = api.config;
  const pluginCfg = (api.pluginConfig ?? {}) as Partial<ArchConfig>;

  // __dirname equivalent for ESM
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const archConfig: ArchConfig = {
    openclawDir: pluginCfg.openclawDir ?? join(homedir(), ".openclaw"),
    dryRun: pluginCfg.dryRun ?? false,
    skipAgents: pluginCfg.skipAgents ?? [],
    forceOverwrite: pluginCfg.forceOverwrite ?? false,
    templateDir: pluginCfg.templateDir ?? "",
    hrAgentId: pluginCfg.hrAgentId ?? "hr",
  };

  // Resolve template dir — look in multiple possible skill installation paths
  if (!archConfig.templateDir) {
    const candidates = [
      // Installed as a skill via clawhub or symlink
      join(archConfig.openclawDir, "skills", "openclaw-org", "skill", "assets", "templates"),
      // Installed as a plugin (plugin-relative path)
      join(__dirname, "..", "skill", "assets", "templates"),
      // Fallback: user workspace templates
      join(archConfig.openclawDir, "workspace", "templates"),
    ];
    archConfig.templateDir = candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hook: gateway_start — full audit of all agent workspaces
  // ──────────────────────────────────────────────────────────────────────────
  api.on("gateway_start", async (_event, _ctx) => {
    log.info("[arch-enforcer] Gateway started — running full workspace audit…");
    try {
      // Check if HR agent exists — warn if missing
      const hrCheck = checkHrAgent(config, archConfig.hrAgentId);
      if (!hrCheck.exists) {
        log.warn(`[arch-enforcer] ${hrCheck.warning}`);
      }

      const report = await scanAndEnforce(config, archConfig, log);
      if (report.patched > 0) {
        log.info(
          `[arch-enforcer] Patched ${report.patched} agent(s): ${report.patchedAgents.join(", ")}`
        );
      } else {
        log.info("[arch-enforcer] All agent workspaces are compliant ✅");
      }
      if (report.errors.length > 0) {
        for (const err of report.errors) {
          log.warn(`[arch-enforcer] Error: ${err}`);
        }
      }
    } catch (err: any) {
      log.error(`[arch-enforcer] Audit failed: ${err?.message ?? err}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Hook: subagent_spawned — enforce hierarchy on newly spawned sub-agents
  // ──────────────────────────────────────────────────────────────────────────
  api.on("subagent_spawned", async (event, ctx) => {
    const agentId = event.agentId;
    if (!agentId) return;
    if (archConfig.skipAgents.includes(agentId)) return;

    log.info(`[arch-enforcer] Sub-agent spawned: ${agentId} — enforcing hierarchy…`);
    try {
      const meta = await resolveAgentMeta(agentId, config, archConfig);
      if (meta) {
        const result = await enforceAgentWorkspace(meta, archConfig, log);
        if (result.filesWritten > 0) {
          log.info(
            `[arch-enforcer] Patched ${agentId}: wrote ${result.filesWritten} file(s) — ${result.files.join(", ")}`
          );
        }
      }
    } catch (err: any) {
      log.warn(
        `[arch-enforcer] Failed to enforce ${agentId}: ${err?.message ?? err}`
      );
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Slash command: /enforce — on-demand audit + enforce
  // ──────────────────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "enforce",
    description:
      "Run architecture enforcement audit on all agent workspaces (or a specific agent)",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (cmdCtx) => {
      const targetAgent = cmdCtx.args?.trim() || undefined;

      try {
        if (targetAgent) {
          // Single agent
          const meta = await resolveAgentMeta(targetAgent, config, archConfig);
          if (!meta) {
            return { text: `❌ Agent \`${targetAgent}\` not found in openclaw.json` };
          }
          const result = await enforceAgentWorkspace(meta, archConfig, log);
          if (result.filesWritten > 0) {
            return {
              text: `✅ Enforced \`${targetAgent}\`: wrote ${result.filesWritten} file(s) — ${result.files.join(", ")}`,
            };
          }
          return { text: `✅ Agent \`${targetAgent}\` is already compliant.` };
        }

        // Full audit
        const hrCheck = checkHrAgent(config, archConfig.hrAgentId);
        const report = await scanAndEnforce(config, archConfig, log);
        const lines = [
          `🏛️ **Architecture Enforcement Report**`,
          `- Agents scanned: ${report.scanned}`,
          `- Agents patched: ${report.patched}`,
        ];
        if (!hrCheck.exists) {
          lines.push(`- ⚠️ **HR agent missing**: ${hrCheck.warning}`);
        }
        if (report.patchedAgents.length > 0) {
          lines.push(`- Patched: ${report.patchedAgents.join(", ")}`);
        }
        if (report.errors.length > 0) {
          lines.push(`- Errors: ${report.errors.length}`);
          for (const e of report.errors) {
            lines.push(`  ⚠️ ${e}`);
          }
        }
        if (report.patched === 0 && report.errors.length === 0) {
          lines.push(`\nAll agent workspaces are compliant ✅`);
        }
        return { text: lines.join("\n") };
      } catch (err: any) {
        return { text: `❌ Enforcement failed: ${err?.message ?? err}` };
      }
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Slash command: /offboard — remove an agent with full cleanup
  // ──────────────────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "offboard",
    description:
      "Remove an agent from the org with full cleanup (archive workspace, update config, clean references). Usage: /offboard <agent-id> [--force] [--skip-archive]",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (cmdCtx) => {
      const rawArgs = cmdCtx.args?.trim() ?? "";
      if (!rawArgs) {
        return { text: "❌ Usage: `/offboard <agent-id>` [--force] [--skip-archive]" };
      }

      const parts = rawArgs.split(/\s+/);
      const agentId = parts[0];
      const force = parts.includes("--force");
      const skipArchive = parts.includes("--skip-archive");

      // Verify the calling agent is HR or main (or user-level/unknown).
      // cmdCtx.agentId is the agent that invoked the command. If it's a known
      // non-HR agent, block it. If undefined (direct user or main), allow.
      const callerAgent = cmdCtx.agentId;
      if (callerAgent && callerAgent !== "main" && callerAgent !== archConfig.hrAgentId) {
        return {
          text: `⛔ Only **HR** (\`${archConfig.hrAgentId}\`) or **main** can offboard agents.\n` +
            `Route this request to HR instead.`,
        };
      }

      try {
        const offResult = await offboardAgent(agentId, config, archConfig, log, {
          force,
          skipArchive,
        });

        const lines = [
          `👔 **Agent Offboarding: ${agentId}**`,
          `- Status: ${offResult.status === "removed" ? "✅ Removed" : offResult.status === "archived" ? "⚠️ Partially removed" : "❌ Failed"}`,
        ];

        if (offResult.steps.length > 0) {
          lines.push(`\n**Steps completed:**`);
          for (const step of offResult.steps) {
            lines.push(`  ✓ ${step}`);
          }
        }

        if (offResult.errors.length > 0) {
          lines.push(`\n**Errors:**`);
          for (const err of offResult.errors) {
            lines.push(`  ⚠️ ${err}`);
          }
        }

        if (offResult.status === "removed") {
          lines.push(`\n🔄 Restart the gateway to apply changes: \`openclaw gateway restart\``);
        }

        return { text: lines.join("\n") };
      } catch (err: any) {
        return { text: `❌ Offboarding failed: ${err?.message ?? err}` };
      }
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CLI: registered via api.registerCli() — available when OpenClaw runtime
  // supports `plugins cli` routing (future). Currently enforcement is handled
  // by gateway_start hook and /enforce slash command.
  // ──────────────────────────────────────────────────────────────────────────
  api.registerCli(async (cliCtx) => {
    const cmd = cliCtx.program
      .command("enforce-architecture")
      .description("Audit and enforce hierarchical architecture on all agent workspaces");

    cmd
      .option("--dry-run", "Show what would be changed without writing files")
      .option("--force", "Overwrite existing files even if they exist")
      .option("--agent <id>", "Target a specific agent instead of all")
      .action(async (opts: { dryRun?: boolean; force?: boolean; agent?: string }) => {
        const runConfig: ArchConfig = {
          ...archConfig,
          dryRun: opts.dryRun ?? archConfig.dryRun,
          forceOverwrite: opts.force ?? archConfig.forceOverwrite,
        };
        const cliLog = cliCtx.logger;

        if (opts.agent) {
          const meta = await resolveAgentMeta(opts.agent, config, runConfig);
          if (!meta) {
            cliLog.error(`Agent "${opts.agent}" not found in openclaw.json`);
            return;
          }
          const result = await enforceAgentWorkspace(meta, runConfig, cliLog);
          if (result.filesWritten > 0) {
            cliLog.info(
              `Patched ${opts.agent}: ${result.filesWritten} file(s) — ${result.files.join(", ")}`
            );
          } else {
            cliLog.info(`${opts.agent} is already compliant.`);
          }
          return;
        }

        const report = await scanAndEnforce(config, runConfig, cliLog);
        cliLog.info(`Scanned: ${report.scanned} | Patched: ${report.patched}`);
        if (report.patchedAgents.length > 0) {
          cliLog.info(`Patched agents: ${report.patchedAgents.join(", ")}`);
        }
        for (const e of report.errors) {
          cliLog.warn(`Error: ${e}`);
        }
      });

    // ── CLI: offboard-agent ──
    const offCmd = cliCtx.program
      .command("offboard-agent")
      .description("Remove an agent from the org with full cleanup (archive workspace, update config, clean references)");

    offCmd
      .argument("<agent-id>", "Agent ID to offboard")
      .option("--dry-run", "Show what would be changed without writing")
      .option("--force", "Force removal even if agent has children (cascading delete)")
      .option("--skip-archive", "Delete instead of archiving workspace")
      .action(async (agentIdArg: string, opts: { dryRun?: boolean; force?: boolean; skipArchive?: boolean }) => {
        const runConfig: ArchConfig = {
          ...archConfig,
          dryRun: opts.dryRun ?? archConfig.dryRun,
        };
        const cliLog = cliCtx.logger;

        cliLog.info(`Offboarding agent: ${agentIdArg}…`);
        const offResult = await offboardAgent(agentIdArg, config, runConfig, cliLog, {
          force: opts.force,
          skipArchive: opts.skipArchive,
        });

        cliLog.info(`Status: ${offResult.status}`);
        for (const step of offResult.steps) {
          cliLog.info(`  ✓ ${step}`);
        }
        for (const err of offResult.errors) {
          cliLog.warn(`  ⚠️ ${err}`);
        }
        if (offResult.status === "removed") {
          cliLog.info(`\nRestart gateway to apply: openclaw gateway restart`);
        }
      });
  });

  log.info("[arch-enforcer] Architecture Enforcer plugin registered ✅");
}
