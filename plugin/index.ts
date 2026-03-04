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
 * 3. Provides a CLI sub-command `openclaw plugins cli architecture-enforcer`
 *    for manual audit / enforce runs.
 * 4. Provides a `/enforce` slash-command for on-demand enforcement.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

import {
  scanAndEnforce,
  enforceAgentWorkspace,
  resolveAgentMeta,
  type ArchConfig,
} from "./src/enforcer.js";

// ============================================================================
// Plugin Definition
// ============================================================================

export default function architectureEnforcerPlugin(api: OpenClawPluginApi) {
  const log = api.logger;
  const config = api.config;
  const pluginCfg = (api.pluginConfig ?? {}) as Partial<ArchConfig>;

  const archConfig: ArchConfig = {
    openclawDir: pluginCfg.openclawDir ?? join(homedir(), ".openclaw"),
    dryRun: pluginCfg.dryRun ?? false,
    skipAgents: pluginCfg.skipAgents ?? [],
    forceOverwrite: pluginCfg.forceOverwrite ?? false,
    templateDir: pluginCfg.templateDir ?? "",
  };

  // Resolve template dir — look in skill location first, then workspace
  if (!archConfig.templateDir) {
    const skillPath = join(
      archConfig.openclawDir,
      "skills",
      "openclaw-subagent-architecture",
      "skill",
      "assets",
      "templates"
    );
    const wsPath = join(archConfig.openclawDir, "workspace", "templates");
    archConfig.templateDir = existsSync(skillPath) ? skillPath : wsPath;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hook: gateway_start — full audit of all agent workspaces
  // ──────────────────────────────────────────────────────────────────────────
  api.on("gateway_start", async (_event, _ctx) => {
    log.info("[arch-enforcer] Gateway started — running full workspace audit…");
    try {
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
        const report = await scanAndEnforce(config, archConfig, log);
        const lines = [
          `🏛️ **Architecture Enforcement Report**`,
          `- Agents scanned: ${report.scanned}`,
          `- Agents patched: ${report.patched}`,
        ];
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
  // CLI: openclaw plugins cli architecture-enforcer
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
  });

  log.info("[arch-enforcer] Architecture Enforcer plugin registered ✅");
}
