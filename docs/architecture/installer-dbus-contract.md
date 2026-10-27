# Installer1: the D-Bus contract between Kiwi and the owner's installer

Status: **proposed by Kiwi (P7), to be implemented in `app-installer`**. Kiwi's client is
`core/installer.js` (pure parts in `core/installerModel.js`); it is written against this page and
works today with the mock service in the P7 harness. Background: overhaul plan §9 and
[installer research §4.1](../research/macos/installer-and-app-lifecycle.md#41-the-contract-a-session-d-bus-api-on-the-installer-new).

## 1. Roles
- **Kiwi is the shell** (Dock, Launchpad, Downloads stack). It asks; it never removes anything,
  never runs a package tool and never reads the installer's ledger.
- **The installer owns installs and removals**, including every confirmation the user sees.
- Neither needs the other. Kiwi treats a missing service as "no installer" and only shows what
  it can do without it (EGO: optional, async, timeouts).

## 2. Names
| | |
|---|---|
| Bus | session |
| Bus name | `io.github.blueyzx64.Installer` |
| Object | `/io/github/blueyzx64/Installer` |
| Interface | `io.github.blueyzx64.Installer1` |
| Desktop id | `io.github.blueyzx64.Installer.desktop` (one reverse-DNS id everywhere, research R6) |
| Activation | `/usr/share/dbus-1/services/io.github.blueyzx64.Installer.service` whose `Exec=` starts the installer without a window; export the interface on the connection that already owns the name (the Tauri single-instance plugin uses D-Bus on Linux) |

## 3. Introspection

The block below is the source of truth. `tests/installerModel.test.js` fails when it and
`INSTALLER1_XML` in `core/installerModel.js` differ, so change both together.

```xml
<node>
  <interface name="io.github.blueyzx64.Installer1">
    <method name="Open">
      <arg type="s" name="path" direction="in"/>
      <arg type="s" name="parent_window" direction="in"/>
    </method>
    <method name="ListManagedApps">
      <arg type="a(sssb)" name="apps" direction="out"/>
    </method>
    <method name="OwnsDesktopId">
      <arg type="s" name="desktop_id" direction="in"/>
      <arg type="b" name="owned" direction="out"/>
      <arg type="s" name="app_id" direction="out"/>
    </method>
    <method name="Uninstall">
      <arg type="s" name="app_id" direction="in"/>
      <arg type="s" name="parent_window" direction="in"/>
    </method>
    <signal name="AppsChanged"/>
    <signal name="UninstallFinished">
      <arg type="s" name="app_id"/>
      <arg type="s" name="outcome"/>
    </signal>
    <signal name="Progress">
      <arg type="s" name="operation_id"/>
      <arg type="s" name="title"/>
      <arg type="s" name="phase"/>
      <arg type="i" name="percent"/>
    </signal>
    <property name="Version" type="u" access="read"/>
  </interface>
</node>
```

## 4. Semantics

### Methods
| Member | Behaviour | Errors |
|---|---|---|
| `Open(path, parent_window)` | Same as opening the file from Files: shows the DMG-style window for that package. Returns as soon as the window is up; the install itself is the user's. `path` is an absolute local path; a non-regular file or an unknown type shows the installer's own "can't open" alert, not a D-Bus error. | `InvalidArgs` for a relative path or one that does not exist |
| `ListManagedApps()` | Every app in the ledger: `(app_id, desktop_id, source, can_uninstall)`. `source` is `appImage`, `systemPackage` or `flatpak` (new kinds may appear; Kiwi reads unknown ones as "other"). `desktop_id` is the installed `.desktop` file name, `''` when there is none. `can_uninstall` is false while an operation on that app runs, or when the backend cannot remove it. | none |
| `OwnsDesktopId(desktop_id)` | `(true, app_id)` when the ledger has an app with that desktop id, else `(false, '')`. For callers that need one answer without the list. | none |
| `Uninstall(app_id, parent_window)` | Shows the installer's own confirmation ("Move ‘X’ to the Trash?" for AppImages, "Remove ‘X’? You'll be asked for your password." for system packages) in its window, raised and centred. Returns once the alert is up; the result comes as `UninstallFinished`. A second call for the same app while one is open raises the open alert and emits nothing new. | `io.github.blueyzx64.Installer1.Error.NotManaged` for an id not in the ledger; `…Error.Busy` when another operation holds the backend |

`parent_window` follows the portal convention (`wayland:<handle>` or `x11:<xid>`). Kiwi is the
compositor and has no foreign handle, so it always passes `''`; the installer then centres its
window and activates it with the startup token from its own launch.

### Signals
| Signal | When |
|---|---|
| `AppsChanged()` | After any change to the ledger (install, uninstall, reconcile). Kiwi drops its cache and asks again. |
| `UninstallFinished(app_id, outcome)` | Exactly once per `Uninstall` that showed an alert. `outcome` is `removed`, `cancelled` (the user said no, or dismissed polkit: a cancel, not an error) or `failed:<code>` (a short stable word, e.g. `failed:backend`, `failed:in-use`). Kiwi treats every other value as a failure. |
| `Progress(operation_id, title, phase, percent)` | While an install or removal runs: `operation_id` is stable for the operation, `title` the app's display name ("Lumen Notes"), `phase` one of `inspecting`, `authorizing`, `installing`, `finishing`, `done`, `failed`; `percent` 0–100, or -1 while it is not known. Ends with exactly one `done` or `failed`. At most about 10 signals a second. |

### Property
`Version` (u, read-only): the contract revision, `1` for this page. Revisions only **add**
members; Kiwi needs `Version >= 1` and ignores what it does not know. A breaking change gets a
new interface (`Installer2`) beside this one.

### LauncherEntry mirror (required)
While `Progress` runs, the installer also emits the standard Unity LauncherEntry signal from
any object path, so every dock (Kiwi's, or Dash to Dock) shows a bar on the installer's icon
without knowing this interface:

```
com.canonical.Unity.LauncherEntry.Update(
    'application://io.github.blueyzx64.Installer.desktop',
    {'progress': <0.0..1.0>, 'progress-visible': <true>})
```
and `{'progress-visible': <false>}` after `done` or `failed`. Kiwi's consumer is
`core/launcherEntry.js`; it forgets an entry when its sender leaves the bus.

## 5. Security
- **The confirmation is the security boundary.** Any process of the user can call the session
  bus, so `Uninstall` must never remove without the installer's own alert, and the interface
  has no "silent", "yes" or "force" argument. Do not add one.
- System packages still go through polkit (dnf5daemon on Fedora 44, PackageKit as fallback);
  the installer never collects passwords (its ADR-0007).
- `Uninstall` takes the installer's own `app_id`, never a path or package name, so a caller
  can only name apps the installer installed. Ids are validated against the ledger.
- `Open` only displays a package: it never executes or installs without the user (the
  installer's ADR-0005, inspect without executing).
- No method returns file contents, ledger paths or package metadata beyond the four fields.
- Rate: at most one alert per app at a time (`Busy`, or re-raise), so a caller cannot flood the
  screen with dialogs.

## 6. How Kiwi uses it
| Kiwi | Calls |
|---|---|
| Startup | Nothing until a feature acquires `ctx.installer`. Then `bus_watch_name` on the bus name, one `ListActivatableNames`, and `Get(Version)` when the name appears. |
| Dock, Downloads stack | "Open with Installer" calls `Open(path, '')` when the installer is usable, else launches its desktop file with the file. Install progress comes from the LauncherEntry mirror. |
| Launchpad ⓧ, dock Trash (`core/uninstall.js`) | `ListManagedApps` once (cached until `AppsChanged`), then `Uninstall(app_id, '')`; the poof plays on `UninstallFinished(removed)`, the wobble goes on after `cancelled`. |
| Notch (P5) | `Progress` through `ctx.installer.progress` and the `installer-progress` event ("Installing Lumen Notes… 40 %"). |

Timeouts in Kiwi: 5 s for `ListManagedApps`, 3 s for `OwnsDesktopId` and `Get(Version)`, 8 s for
`Open` and `Uninstall` (which only have to show a window; activation counts).

## 7. Testing without the installer
The P7 harness runs a mock service written in GJS (`tools/smoke/mock-installer.js`): it owns the
bus name, implements this XML with a two-app ledger, answers `Uninstall` with
`UninstallFinished(removed)`, and on `Progress` request emits a 0→100 % run mirrored into
LauncherEntry. The installer repo can reuse it as a reference client test.

## 8. Next steps in `app-installer`
1. Unify the desktop id (`io.github.blueyzx64.Installer.desktop` in the Tauri bundle config,
   metainfo `launchable`, Copr spec) and add a CI check on the built RPM.
2. Export this interface with zbus from the shell crate (composition root), calling the
   existing use cases (`uninstall_app`, library listing); add the D-Bus `.service` file.
3. Emit `Progress` from the install/uninstall progress channel already used by the UI, and the
   LauncherEntry mirror.
4. Write an ADR "External API for the desktop shell" and add this page's XML to
   `docs/architecture/ipc-contract.md` (IPC rule 7).
5. Make dnf5daemon the primary RPM backend on Fedora 44 (GNOME Software there requires
   `dnf5daemon-server`, not PackageKit) and run a fresh-F44 spike.
