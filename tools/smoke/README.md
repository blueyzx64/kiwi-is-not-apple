# Headless smoke test

`tools/smoke/run-headless.sh [toggles]` (or `make smoke`) starts a headless
GNOME Shell (`--headless --wayland --virtual-monitor 1280x800`) with Kiwi enabled,
disables and re-enables it `toggles` times (default 10) over D-Bus, then prints a summary.

## Safety
Everything runs in a temp dir (`/tmp/kiwi-smoke.XXXXXX`): its own HOME, XDG dirs,
`GSETTINGS_BACKEND=keyfile`, private session bus. Your real profile, dconf and
installed extensions are not read or written. Kiwi is copied (not linked) from the repo.

## Needs
`gnome-shell`, `dbus-run-session`, `gsettings`, `glib-compile-schemas`, `gdbus`, `python3`.
If `org.freedesktop.login1` is missing from the system bus (containers) it starts
`fake-logind.js` (needs `gjs`) and a system `dbus-daemon`. On a normal desktop this is skipped.

## Reading results
Output: `Kiwi JS errors: N   Kiwi CRITICALs: M`, then one line per `file:line` and
message with a count. Exit 0 = none, 1 = Kiwi-related errors, 2 = setup failure / Shell did not start.
Counts include errors in teardown (disable). Full log: `<workdir>/shell.log`
(kept on failure; `KIWI_SMOKE_KEEP=1` always keeps it, `KIWI_SMOKE_DIR=path` picks the dir).
Noise from missing services (GDM, calendar, polkit, colord, ibus) is ignored.

## Env flags
- `KIWI_SMOKE_SHELL_VERSION=46`: add that version to the temp copy's `metadata.json` only.
  Default: use the installed Shell as is.
- `KIWI_SMOKE_SHIM=1`: container-only. Patches the temp copy for Shell 46 API gaps
  (`MessageView`, `orientation`). Never needed on 48-51.

Not exercised: windows, fullscreen, media players, clipboard. Enable/disable only.
Not run in CI (needs gnome-shell and D-Bus).

## Scenarios (`KIWI_SMOKE_EXTRA`)
`KIWI_SMOKE_EXTRA=file tools/smoke/run-headless.sh 0` also installs the harness probe
(`tools/harness/probe/probe@x2`) and runs `file` once Kiwi is up, with the helpers of
`scenario-lib.sh`: `P '<js>'` (async JS in the Shell; `inst('<feature-id>')` is a running
feature), `T name '<js>'` (an assertion whose JS returns "PASS ..." or "FAIL ..."), `key`,
`keydown`, `keyup` (a virtual keyboard; Clutter keysym names such as `KEY_Caps_Lock`), `gs key
value` (a Kiwi setting) and `pause s`. Lines starting with `FAIL` make the run exit 1.

```sh
cat > /tmp/s.sh <<'EOF'
key KEY_Caps_Lock; pause 0.3
T caps-badge 'return inst("input-indicator").badge?.style === "caps-on" ? "PASS" : "FAIL";'
EOF
KIWI_SMOKE_EXTRA=/tmp/s.sh tools/smoke/run-headless.sh 0
```

No `dbus-run-session` (Fedora with dbus-broker only): any stand-in that runs the command on a
private session bus works; link `tools/smoke/dbus-run-session-broker.py` as `dbus-run-session` in a directory first in `PATH`.
