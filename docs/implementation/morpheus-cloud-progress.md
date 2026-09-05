# Morpheus Cloud execution

- Goal created; Apple/Clerk handoff and both checkouts inspected.
- Web branch: `codex/morpheus-cloud`; native `main` has pre-existing cache/session/test edits preserved.
- U1 in progress: cloud protocol and infrastructure inventory.
- U2 pending: discovery catalog and achievement rules.
- U3 pending: web sync and interface.
- U4 pending: native sync/auth/report integration; dirty-checkout and Apple capability/profile-impact questions sent.
- U5 pending: privacy/license requirements and disclosure.
- U6 pending: admin and deployment verification.

## Initial evidence

Both platforms already use `morpheus-living-save-session`, schema 1, game-data version 1. Each has three save slots. Web uses IndexedDB and authored state/scene validation; native JSON encoding matches the same fields. Web `/admin` already checks configured Clerk user ID plus verified admin email. No cloud API routes or native Clerk integration were present at inspection.

The linked Vercel project is `morpheus-web-www` (`prj_Ck4KfsUOD3ECmJMr9JtfhGNHFSND`), team `team_Eam5iv5Hn4S5k8mGzMlZRSpH`.
