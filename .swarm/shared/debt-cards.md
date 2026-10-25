# Debt and support lead cards (Sonnet, wave E; orchestrator-written)

Owner raised the cap to **30 Sonnet agents**. These cards run beside the feature leads.
Source of truth for each item: `docs/architecture/tech-debt-and-conflicts.md` §2 (row given).
Each card OWNS only the files listed. Feature leads own: S4 clipboard/keybindings/modalSurface;
S5 spotlight; S7 controlCenter, quickSettingsDnDRemoval, addUsernameToQuickMenu, batteryPercentage,
lockIcon, quickSettingsNotifications; S8 notch, notificationRouter, calendar, panelMedia,
mediaPlayback; S9 stageManager, windowState, minimizedToDock, hideMinimizedWindows,
windowControls, moveFullscreenWindow, windowTiling. **Never edit those.**

Common rules: start-workflow.md §0 §2 §4; decisions.md; contracts.md; CLAUDE.md. Branch
`debt/<card>` in worktree `../kiwi-<card>` from `ccr-f3c1f44c-rv5a8r`. No visible behaviour change
unless the row says so. Schema keys → `.swarm/agents/<ID>.schema.xml`; features.js lines → Outbox
`TO S10:`. eslint (no new warnings), `bash tests/run.sh` green, add gjs -m tests for any pure
helper. Author blueyzx64, no AI trailers, no push. Memory `.swarm/agents/<ID>.md` with a manual test
list. Report per §9.

| ID | Card | Owns | Rows (§2) |
|---|---|---|---|
| D1 | user-files | apps/mozillaThemeManager.js, apps/gtkThemeManager.js | 2.6: user.js line removed on disable (Kiwi-tagged only); all remaining sync IO → async Gio; dangling gtk.css imports after crash/uninstall (document + safest mitigation); 2.8 log instead of swallow around deletes |
| D2 | panel-transparency | apps/panelTransparency.js | 2.5: per-workspace signals reconnect on switch-workspace and window-added on all workspaces, then drop the 2s poll (2.4); sync IO at :260 (grep); keep S3 glass + S6 PanelVisibility hunks intact |
| D3 | overview-patches | apps/overviewSeamlessZoom.js, apps/skipOverviewOnLogin.js, apps/reduceWindowAnimations.js | 2.2: Workspace.prototype._init and Main.overview.show via InjectionManager (or CleanupRegistry.inject); do not reset firstLogin on disable; guard private props; 2.5 reduceWindowAnimations patched actors cleared in disable; keep S6's overview inset hunk intact |
| D4 | window-utils | new apps/util/windows.js, apps/windowTitle.js, apps/focusOnOverviewExit.js, apps/transparentMove.js | 2.7: shared isUserWindow()/windowForActor() (S9 adopts later in windowControls; do NOT edit it); 2.2 windowTitle AppMenu privates guarded with optional chaining; 2.5 transparentMove pid → WeakMap on Meta.Window; snake_case names in transparentMove |
| D5 | dock | apps/dockBlur.js, apps/dockUtils.js, apps/dockColors.js, apps/launchpadApp.js | 2.7: dockBlur dock discovery via dockUtils.watchDocks; unify bounded retries; 2.6 dockColors persists D2D originals in a Kiwi key (fragment) and restores after a crash; launchpadApp lookup_app override via CleanupRegistry.inject |
| D6 | css-debt | stylesheet.css (existing rules ONLY, not the feature blocks at the end), css/fixes3.css, css/fixes4.css | 2.9: gate stock-class rules behind kiwi- classes (coordinate: the class must be added by the owning module; list needed module hunks in Outbox, don't edit modules owned above); delete dead Gjs_AggregateMenu selectors; GType selector → style class; inherit/black naming; 2.3 |
| D7 | build-ci | .github/workflows/*, new Makefile, README.md (badge/install text only), metadata.json description (propose only, Outbox) | 2.11: CI job eslint + schema strict + tests/run.sh + gnome-extensions pack on PRs; replace archived upload-release-asset; Makefile pack/pot/install/test/lint; README badge 48–51 |
| D8 | docs | docs/architecture/code-map.md, docs/features/README.md status column | code-map rows for everything merged so far (lib/, coordinators/, apps/windowControls/, apps/liquidGlass/, apps/autohide/, panelHover removed); features README status for merged features; nothing else |
| R1 | reviewer 2 | none (read-only) | Second EGO/correctness reviewer. Same checklist as S10 (`.swarm/agents/S10.md`). Reviews whatever the orchestrator sends; never edits branches |
