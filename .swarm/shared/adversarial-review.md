# Adversarial review brief (orchestrator; read-only reviewers V1–V10)

Target: branch `ccr-f3c1f44c-rv5a8r` (PR #2) vs `main`. All 8 features are merged and ON by default.
GNOME Shell 48–51. Context: `.swarm/shared/decisions.md`, `contracts.md`, `docs/features/*.md`,
`docs/testing/release-notes-and-manual-tests.md`, `CLAUDE.md`.

## Your stance
Assume the code is broken until proven otherwise. Earlier reviewers approved it; your job is to find
what they missed. Do not trust comments, commit messages or `.swarm/agents/*.md` claims. Read the code.

## Rules
- READ-ONLY: never edit, commit or push in the repo. Scratch work goes in `/tmp/<your ID>/` only.
- You may run: `make check`, `bash tests/run.sh`, `gjs -m` scripts, eslint, and
  `KIWI_SMOKE_SHELL_VERSION=46 KIWI_SMOKE_SHIM=1 make smoke` (Shell 46, container only, indicative).
  You may write throwaway gjs probes in /tmp to prove a bug in pure code.
- GNOME Shell sources for 48.0, 49.0, 50.0 and main are on gitlab:
  `https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/<tag>/js/ui/<file>.js` (mutter likewise). Fetch
  them to verify any Shell API claim. Tags look like `48.0`, `49.0`, `50.0`.
- Every finding must have:
  - `file:line`;
  - a concrete trigger (user steps or event sequence) and the wrong result;
  - severity: **S1** user loses data or windows, Shell crash/freeze, or a feature unusable;
    **S2** feature misbehaves or leaks;
    **S3** minor or cosmetic;
  - confidence that it is real: High / Med / Low.
- No style nits. No "consider refactoring". Only behaviour that is wrong, or that is unproven and likely wrong.
- Also list what you verified as correct, in one line each, so the orchestrator knows the coverage.
- Report caveman-style, ≤45 lines: findings sorted by severity, then the coverage list.
