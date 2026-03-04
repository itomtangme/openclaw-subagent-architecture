# TOOLS.md — HR

## Available Tools

### Onboarding (Adding Agents)
- `openclaw agents add` — register a new agent in openclaw.json
- `openclaw config` — update openclaw.json (agent-related config only)
- `/enforce` — trigger architecture enforcement to generate hierarchy workspace files
- `/enforce <agent-id>` — enforce a specific agent's workspace
- File read/write — to verify/patch SOUL.md, AGENTS.md, AGENT-MANIFEST.md in agent workspaces

### Offboarding (Removing Agents)
- `/offboard <agent-id>` — full agent removal with cleanup
  - Archives workspace (renamed to `workspace-<id>.archived-<timestamp>`)
  - Removes from parent's `subagents.allowAgents`
  - Removes from `agents.list` in openclaw.json
  - Cleans stale references in sibling/parent workspace files
  - Updates main AGENTS.md registry
- `/offboard <agent-id> --force` — cascade-remove children
- `/offboard <agent-id> --skip-archive` — skip workspace archiving

### Triggering Enforcement
Enforcement runs automatically on gateway start/restart and sub-agent spawn.
You can also trigger it on-demand via slash commands:
- `/enforce` — audit all agents
- `/enforce <agent-id>` — audit a specific agent
- `/offboard <agent-id>` — remove an agent
- `/offboard <agent-id> --force` — cascade-remove children

> **Note:** `openclaw plugins cli` is not currently supported in the OpenClaw runtime.
> Use slash commands (`/enforce`, `/offboard`) or restart the gateway to trigger enforcement.

## Notes
HR should always use `/enforce` after adding agents to ensure hierarchy files are correctly provisioned.
After any onboard/offboard, remind to `openclaw gateway restart`.
