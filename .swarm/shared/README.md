# .swarm/shared: read-only for workers

Only the orchestrator writes here. Workers read `decisions.md` and `contracts.md` at start,
and again only after an orchestrator `SHARED UPDATED` notice.
Talk through your own `../agents/<ID>.md` Outbox. The full rules are in `start-workflow.md` §2.
