## Status
working (worktree /home/user/kiwi-r2-menubar, branch v3/r2-menubar)
## Plan
1 transparent bar default + key menubar-solid-on-window (off); 2 ModalSurface hover-switch (NC) + autoclose hunt; 3 overlay-key allowed in POPUP always; 4 maximized bar; 5 real Fedora logo via shader recolour; 6 verify Alt+Tab
## Progress log
- Run1 (/tmp/x2/runs/20261027-190139-kiwi-r2-menubar-f44b, scenario scratchpad/r2b/s1.sh): maximize keeps bar visible (monFs false) in harness. Spotlight w/ QS or NC open: NOT opened (repro). Hover nc->qs: NOT switched (repro); stock qs->clip hover works. Autoclose not reproduced headless (5x each).
- Cause for report 4: schema windows-green-click default 'fullscreen' => green button makes REAL full screen (bar+dock hide, edge reveal). R2A owns windowControls: default should be 'zoom'.
- GNOME switch-applications already = Super+Tab and Alt+Tab; switcher takes it over.
## Findings for orchestrator
- see above (green click default)
## Handoff
implement items, final run
