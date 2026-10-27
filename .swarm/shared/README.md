# .swarm: shared and private memory

- `.swarm/shared/`: the **shared memory**. Only the orchestrator writes here. Every agent reads it at start and whenever the orchestrator sends a `SHARED UPDATED` notice.
- `.swarm/agents/<ID>.md`: each agent's **own memory**. Only that agent writes its file, and never anyone else's.
- Always use the absolute paths in the main checkout, `/home/user/kiwi-is-not-apple/.swarm/...`, even when you work in a worktree, so everyone sees the latest copy. The orchestrator commits these files.

Start with `v3-swarm.md` (the roster and protocol), then `v3-build.md` (build rules).
