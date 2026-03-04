# AGENTS.md — HR Sub-Agent Registry

## Architecture
- Version: 2.2
- This Agent: hr (L1-C)
- Parent: main

## Sub-Agent Tree
| ID | Name | Type | Layer | Model Tier | Status |
|----|------|------|-------|------------|--------|
| — | — | — | — | — | (HR operates solo — no sub-agents) |

## Agent Installation Policy
✅ **HR is the designated agent for all agent provisioning.**
HR is authorized to add, remove, and restructure agents on behalf of the user.
Other agents should route agent-related requests to HR rather than acting independently.

## Notes
HR does not delegate. It handles all agent governance directly.
