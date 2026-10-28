## Status
done: v3/r3-notch committed
## Findings
Root cause: notch view's input plate stayed reactive during a shelf drag, so drops inside the dashboard footprint (y<192, where a maximized or top-touching window lies) never reached the window. Helper stacking/placement were already correct (above, sticky, y=70 inside work area). Fix: view.js _syncPlate hides plate while dragging.
Scenario: /tmp/claude-0/-home-user/1c9cfc23-1f6c-5ceb-aec3-03f023179fb0/scratchpad/r3d/d3.sh
