# CI Failure Triage

- Repository: `QuyDu/Skills-Orchestrator`
- Pull request: `#8`
- Run: `34630219417`
- Source revision: `57568fb667e1b6ccc462dc1cc5b16c1c8c544bda`
- Status: **repair validated locally; remote recheck pending**

## Failure

All Windows and macOS Node 22, 24, and 26 jobs failed in the same two Agent Builder tests. The first causal error was:

`Agent Builder stopped: --agent must match the blueprint target inside the project`

Ubuntu passed because its runner path did not expose the same filesystem alias.

## Root Cause

`safeProjectRoot` canonicalized the project root, while `validateInstalled` compared the resulting canonical target to lexical `path.resolve(agentFile)`. Equivalent paths through runner filesystem aliases compared unequal.

## Repair

- Canonicalize the supplied existing agent path before comparison.
- Compare Windows filesystem paths case-insensitively.
- Add regression coverage that validates an installed agent through a project-root alias.

## Local Validation

- Alias reproduction: 3 passed, 0 failed.
- Complete Agent Builder suite: 18 passed, 0 failed.
- `npm run check`: 134 passed, 1 platform-specific skip, 0 failed.
- All 45 skills verified; 221 files security-scanned; 161 unsigned candidate files verified.

## Remaining Gate

Push the focused repair and observe the replacement hosted Windows and macOS checks. Protected auto-merge must remain blocked until required checks pass.
