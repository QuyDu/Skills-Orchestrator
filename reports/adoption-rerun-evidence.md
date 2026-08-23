# Adoption Rerun Evidence

- Generated: 2026-08-21T13:03:14.743Z
- Profile: `core`
- Fixture: `adoption-evidence-fixture`
- Runtime: `1.0.0`

The evidence was generated from a disposable local project. The initial dry run was compared with the persisted applied plan, and a second dry run verified the no-op state.

| Stage | Planned writes | Covered assets | Conflicts | Already current |
| --- | ---: | ---: | ---: | ---: |
| Before apply | 86 | 1 | 0 | 0 |
| No-op rerun | 0 | 1 | 0 | 86 |

## Before Apply

### Covered Assets

| Planned framework asset | Covered by project asset |
| --- | --- |
| `.github/instructions/security.instructions.md` | `.github/instructions/appsec.instructions.md` |

### Planned Writes

| Action | Count | Example paths |
| --- | ---: | --- |
| `create` | 86 | `.github/skills/architecture-review`, `.github/skills/artifact-upgrade`, `.github/skills/audit-azure-environment` |

### Conflicts

No blocking conflicts were present in the applied plan.

## No-Op Rerun

The rerun is a verified no-op: **yes**. It planned 0 writes and found 0 blocking conflicts.
