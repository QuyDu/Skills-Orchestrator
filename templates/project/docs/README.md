# Documentation

| Document | Purpose | Owner |
| --- | --- | --- |
| `adr/` | Architecture Decision Records. One decision per file, numbered sequentially. | Architecture |
| `deployment.md` | Environments, prerequisites, deployment procedure, verification, and rollback. | Engineering |
| `operations.md` | Monitoring signals, alerts, common failures, and recovery steps. | Operations |
| `architecture.md` | Component map, data flow, trust boundaries, and external dependencies. | Architecture |

Generate and refresh these with `/documentation-builder`. Create decision records with `/create-adr`.

Machine-readable evidence lives in `reports/` and is authoritative. Documentation in this folder is written for humans and must not contradict it.
