# Installing, updating and removing apps: macOS → Kiwi, plus the owner's app-installer

Scope: the whole macOS app lifecycle, from download through first launch, background running, updates and removal. It also covers first-run onboarding (Setup Assistant, Migration Assistant). Each feature is mapped onto Fedora 44 / GNOME 50 (Wayland): Flatpak, RPM, AppImage, GNOME Software, PackageKit / dnf5daemon, portals, the Background portal, GNOME Settings → Apps, and XDG autostart. The last part assesses the owner's `app-installer` (cloned read-only at `/home/user/app-installer`) and plans how it and Kiwi fit together.

Release context, as of 2026-10-27: macOS 26 Tahoe is the current mainstream release, and macOS 27 "Golden Gate" has shipped (Apple's Mac User Guide already lists it). Apple's install, Gatekeeper and login-item behaviour described below is unchanged in 27 as far as the public docs show. Where a fact is unverified it is marked ⚠.

Template: see `README.md` in this folder. All file references in the assessment section are relative to `/home/user/app-installer` unless they start with `apps/`, `lib/` or `docs/` in the Kiwi repo.

---

## A. Getting an app onto the machine

### DMG drag-to-Applications (the mounted volume window)
- **Introduced / changed:** Disk images go back to classic Mac OS. The modern "drag the icon onto the Applications alias" convention dates from early OS X and has not changed in substance since. Since 10.15 macOS cannot create "Internet-enabled" images any more, and Safari has ignored that flag since 10.7. Safari's "Open 'safe' files after downloading" still treats `.dmg` as safe, so it mounts the image automatically.
- **What it is:**
  - The user double-clicks a `.dmg` in Downloads, or Safari opens it. DiskImages verifies the checksum (a "Verifying…" progress sheet on large images). The volume mounts under `/Volumes/<Name>`, and Finder opens its root window.
  - The window is a normal Finder icon-view window. The developer authored it: a fixed window size and position, hidden toolbar and sidebar, a large icon size, and a background picture (usually stored in a hidden `.background/` folder). The layout is saved in the image's `.DS_Store`. Tools such as `create-dmg` set `--background`, `--window-size`, `--icon <name> x y` and `--app-drop-link x y`.
  - Two icons sit on the art: the `.app`, and a symlink (or Finder alias) to `/Applications`. Usually an arrow is painted between them. Some images add a licence agreement (SLA) sheet that must be accepted before the image mounts, or a "Read Me".
  - The user drags the app onto the alias. Finder copies the bundle (with a copy progress window), and the app appears in `/Applications` and in Launchpad/Apps. The user then ejects the volume (the ⏏ in the Finder sidebar, or dragging the volume to the Trash, which turns into an Eject icon) and may trash the `.dmg`.
  - There is no install step and no receipt, and no admin password is needed when the user is an admin. A standard user who drags into `/Applications` is asked to authenticate.
- **Caveats (on macOS):**
  - Users often run the app straight from the mounted image. It then runs translocated, from a read-only location (see the next feature), and it vanishes on eject. A Dock icon pinned while it ran from the image goes stale.
  - Dragging an app that is already in `/Applications` brings up a "Replace / Keep Both / Stop" dialog. Replacing a running app fails.
  - Nothing tells the user to eject or delete the image, so Downloads fills up with old `.dmg` files.
  - The background art is fragile. `.DS_Store` positions break when the volume name or icon size changes, and layouts that look right on one display scale look misaligned on another.
- **Port to GNOME 50:**
  - The owner's app-installer already *is* the port of this window: a fixed 600×400 window with the app icon, an animated arrow and an Applications folder tile (`src/lib/features/installer/DmgView.svelte`, `ApplicationsFolder.svelte`, `DraggableAppIcon.svelte`).
  - **AppImage** is the true DMG analogue: one self-contained file, copied to `~/Applications`, with no password. The installer then generates a `.desktop` entry and icons, which DMGs never needed because Finder reads the bundle itself.
  - **RPM** behaves more like a `.pkg` (see Installer.app): system-wide, root scriptlets, a receipt in the rpmdb. The installer deliberately hides that behind the same drag gesture.
  - **Flatpak bundles and refs** (`.flatpak`, `.flatpakref`) are not handled. GNOME Software opens them.
  - Kiwi's part is integration, not reimplementation: the Downloads stack opens files through the default handler (`apps/downloadsStack.js:90`, `Gio.AppInfo.launch_default_for_uri`), so once the installer is the default for `application/x-rpm` and `application/vnd.appimage` the macOS flow follows naturally. See the integration plan.
- **Blockers / risks:**
  - Wayland: the installer cannot position itself relative to Files or the dock. It can only `center`.
  - An undecorated, transparent WebKitGTK window gets no compositor shadow on GNOME (ADR-0006 spike still open). Kiwi's own rounded corners and window-control features must not decorate it a second time.
  - There is no Linux counterpart to "Replace / Keep Both". The installer's "Update" label (F-13) covers upgrades, and "A newer version is already installed" (F-14) covers downgrades.
- **Linux equivalents today:** Gear Lever (Flathub; AppImage integration), AppImageLauncher, GNOME Software (`--local-filename` for local RPMs on PackageKit-based builds and for `.flatpakref`). Nothing on GNOME presents the DMG-window metaphor except the owner's installer.
- **Kiwi status:** none in Kiwi. The installer has it built (AppImage path real, RPM path wired, see the assessment).
- **Recommendation:** **Port (P1 core)** through the installer, effort **S** on the Kiwi side (default-handler hand-off plus the Downloads stack). It is the flagship "Mac way" to install, and the owner has already built it.

### App Translocation and the quarantine flag
- **Introduced / changed:** The `com.apple.quarantine` extended attribute dates from 10.5 Leopard. App Translocation (Gatekeeper Path Randomization) arrived in 10.12 Sierra. The rules have changed silently since; Apple documents only "Gatekeeper opens apps from randomized, read-only locations when necessary".
- **What it is:**
  - Browsers, Mail, AirDrop and Messages write a `com.apple.quarantine` xattr (agent, timestamp, origin) on every file they download. The flag propagates to the files extracted from an archive or a mounted DMG.
  - On first launch through Launch Services, a quarantined app that has not been *moved by Finder* from where it was downloaded or unpacked is run from a randomized, read-only mount (`/private/var/folders/…/AppTranslocation/<UUID>/d/App.app`). That stops a malicious plug-in or dylib shipped *next to* a benign app from being loaded through a relative path.
  - Moving the app with Finder (for example, the drag onto Applications) clears the translocation condition. Gatekeeper's first-launch approval clears the quarantine "unapproved" state.
- **Caveats (on macOS):**
  - Translocated apps cannot self-update, cannot find files beside themselves, and can fail as login items. Keyboard Maestro and many others document this.
  - Eclectic Light reports translocation still happening after a move into `/Applications`, so the rules are not fully predictable.
  - Developers resort to "Move to Applications?" prompts inside the app (LetsMove-style).
  - Power users strip the flag with `xattr -dr com.apple.quarantine`, which is exactly the habit malware instructions exploit.
- **Port to GNOME 50:**
  - Linux has no quarantine xattr in practice. Chromium *stopped* writing `user.xdg.origin.url` and `user.xdg.referrer.url` on Linux in 2019 for privacy reasons, Firefox never wrote them (Mozilla bug 665531 still open), and wget and curl only do so on request.
  - The de facto "quarantine" on Linux is the **missing executable bit**: a downloaded AppImage is not `+x`, so it cannot be double-click-run, and Files hands it to the default handler instead. The installer already relies on this, and it is the right design. Opening a file never runs it (ADR-0005), and install sets `0755` only after the user consented by dragging (`src-tauri/crates/infrastructure/src/appimage_store.rs`).
  - **Translocation is moot** for AppImages: they are a single file, and the installer generates its own `.desktop` file and never copies the embedded `Exec=` (`desktop_entries.rs`). That removes the "plug-in next to the app" vector by construction.
  - A Kiwi/installer equivalent of "Move to Applications?" already exists: an AppImage opened from `~/Applications` itself is "already in the store" and is just made runnable (`appimage_store.rs:69`).
- **Blockers / risks:** None of these signals survive copying from a USB stick or a `curl` download. Provenance cannot be shown ("downloaded from example.com") without browser cooperation. GNOME's XDG extended-attribute spec discussion (Discourse, 2023) has not produced anything.
- **Linux equivalents today:** the executable bit, SELinux `user_home_t` labels (unconfined users may run them), and Flatpak's sandbox for Flatpak apps.
- **Kiwi status:** none (not needed in the Shell).
- **Recommendation:** **Skip** as a feature. Keep the installer's "never execute before consent" rule and the missing-`+x` hand-off. Effort **S**. There is nothing to emulate beyond what the installer already does, and copying the user-facing friction would be a regression.

### Installer.app and `.pkg` packages (steps UI, scripts, receipts)
- **Introduced / changed:** Installer.app (at `/System/Library/CoreServices/Installer.app`) has been around since OS X 10.0. Flat packages (xar archives) arrived in 10.5, and distribution packages with `distribution.xml` define the steps. Since 10.15 `.pkg` files are Gatekeeper- and notarization-checked like apps. After a successful install, Installer offers to move the installer package to the Trash.
- **What it is:**
  - A wizard with a left-hand step list. Each step is optional and defined by the package author: **Introduction** (welcome), **Read Me**, **License** (an "Agree / Disagree" sheet), **Destination Select** (which disk; often skipped), **Installation Type** (Standard install, or *Customize* with a checklist of optional components and their sizes), **Installation** (admin authentication, then a progress bar with phases such as "Preparing", "Writing files", "Running package scripts", "Registering updated components"), and **Summary** ("The installation was successful", plus the "Move to Trash / Keep" prompt).
  - The package has a payload (a cpio archive), a BOM (bill of materials), and optional `preinstall` / `postinstall` scripts that run **as root**. Distribution packages can also run JavaScript installation checks (OS version, hardware).
  - **Receipts:** every install is recorded (BOM plus metadata), historically in `/var/db/receipts`. Apple says to query them only through `pkgutil` (`--pkgs`, `--files <id>`, `--file-info <path>`). `installer -pkg x.pkg -target /` is the command-line equivalent, and `/var/log/install.log` is the log.
- **Caveats (on macOS):**
  - Scripts run as root with no review, the classic malware vector. Gatekeeper and notarization exist largely because of this.
  - There is **no uninstaller**. Receipts list files, but Apple ships no "remove package" UI, and `pkgutil --forget` only drops the receipt. Vendors ship their own "Uninstall X" apps.
  - Users dislike `.pkg`s that install launch daemons, kernel or system extensions, or "helper" tools they did not ask for.
- **Port to GNOME 50:**
  - **RPM is the `.pkg` of Fedora**: system scope, `%pre` / `%post` scriptlets as root, dependencies, receipts in the rpmdb (`rpm -qa`, `rpm -qf`, `rpm -ql`), and a real uninstall (unlike macOS).
  - The owner's installer chooses *not* to show the multi-step wizard. It keeps the DMG drag gesture, then shows `Preparing → WaitingForPermission → Downloading/Installing → Finishing` (`docs/architecture/state-machines.md`). That is the right call for apps.
  - Where a wizard *is* right on Linux: installing **Kiwi itself** (a Shell extension plus optional extras plus a settings profile) maps cleanly onto Introduction → License → Install → Setup → Summary. See "How to install Kiwi the Mac way".
  - The "Move installer to Trash?" prompt is easy to copy: after an install from `~/Downloads`, the done view can offer "Move the downloaded file to the Trash", using GIO trash, which is recoverable.
  - Use transaction simulation (PackageKit `InstallFiles` with `SIMULATE`, or dnf5daemon `Goal.resolve`) as the "Installation Type: size" equivalent. The installer has this as F-27 (`InstallEvent::Plan` with `extraPackages` and `downloadBytes`).
- **Blockers / risks:**
  - RPM scriptlets run as root with no sandbox, so a third-party RPM is as dangerous as a `.pkg`, and the installer currently shows no trust signal (F-16 parked).
  - Some vendor RPMs (Chrome, VS Code, Slack and others) drop a `.repo` file into `/etc/yum.repos.d`. That turns them into an update channel, which is good, but the user is never told.
- **Linux equivalents today:** `dnf install ./x.rpm`, GNOME Software for local RPMs (PackageKit-based builds only; ⚠ the Fedora 44 dnf5 plugin's local-file support needs checking), and `rpm -qip` / `rpm -qlp` to inspect. Nothing presents a step list.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3)** for a generic wizard. Use it only for installing Kiwi itself (see the plan). Effort **M**. Apps should keep the one-gesture DMG flow, and a wizard pays off only for system add-ons.

### Gatekeeper, notarization and "Open Anyway"
- **Introduced / changed:** Gatekeeper arrived in 10.7.5/10.8 (the "allow apps from anywhere / identified developers / App Store" setting). Notarization became required for Developer ID software by default in **10.15 Catalina**. **macOS 15 Sequoia** removed the Control-click → Open bypass: the user must now go to *System Settings → Privacy & Security → Open Anyway* and then authenticate as an admin. In Sequoia and Tahoe the blocking dialog reads "Apple could not verify '<App>' is free of malware…" with only **Done** and **Move to Trash**.
- **What it is:**
  - On first open of quarantined software (apps, plug-ins, installer packages), Gatekeeper checks three things: the **Developer ID signature** (identified developer, not modified), the **notarization ticket** (stapled to the app or fetched online over CloudKit), and **XProtect** signatures (and XProtect Remediator for cleanup). The checks run in that order.
  - Outcomes and their dialogs:
    - Notarized: "'App' is an app downloaded from the Internet. Are you sure you want to open it?", with **Open** and **Cancel**. Shown once, then remembered.
    - Unsigned or not notarized: "could not verify". Allowed only through *Open Anyway* in Privacy & Security, which shows the prompt again, needs an admin password, and is then saved as an exception.
    - Modified or damaged: "is damaged and can't be opened".
    - Known malware: "will damage your computer", and the file is moved to the Trash. The user may be asked to share a sample.
  - Apple can issue **revocation tickets** for notarized software, and these are checked more often than XProtect signature updates. Apple says the checks are not tied to the user's Apple Account and that IP addresses are not logged.
  - Policy setting: *Allow applications from*: **App Store** or **App Store & Known Developers**. "Anywhere" is hidden unless re-enabled with `spctl --master-disable`.
- **Caveats (on macOS):**
  - Network dependence: an unstapled app opened offline can fail validation. A DMG ticket does not cover the app once the image is unmounted.
  - Sequoia had a bug that reported notarized apps as "damaged".
  - The Sequoia change annoyed developers of free or open-source software who cannot pay $99 a year.
  - Users are trained to click through. The dialog says nothing about *what* the app will do.
- **Port to GNOME 50:**
  - **Flatpak + Flathub is the closest analogue to "notarized / App Store"**: OSTree commits signed with GPG, Flathub's review and its "verified" developer badge, and runtime sandboxing. GNOME Software shows an install-time **safety/permissions summary** ("Safe", "Potentially unsafe", "Unsafe") built from the Flatpak permissions and the licence. That is a better model than Gatekeeper because it is computed from what the app can actually do.
  - For **RPM**: GPG signatures. PackageKit escalates unsigned local files to the polkit action `org.freedesktop.packagekit.package-install-untrusted`, and dnf5daemon to its own `auth_admin` action. That is the "Open Anyway + admin password" moment, but polkit's dialog does not explain *why*.
  - For **AppImage**: optional embedded GPG signatures (`.sha256_sig` section) are rarely used. There is no sandbox and no revocation.
  - **Recommended "Gatekeeper-lite" in the installer** (this is the F-16 design the docs ask for), shown *before* the drag, in plain words, in the DMG window:
    1. "From an identified developer": the RPM header signature checked against the keys already in the rpmdb (`gpg-pubkey`), read without running anything.
    2. "Installs for everyone and runs setup steps with full access": the RPM has `%pre` / `%post` scriptlets (headers only).
    3. "Will keep itself up to date": the payload contains `/etc/yum.repos.d/*.repo`. Read the file list from the headers.
    4. AppImage: "Not checked by anyone. Only open apps from developers you trust." Show this unless a valid embedded signature is present.
  - Kiwi's part: none in the Shell. The polkit dialog is Shell UI, so Kiwi's faux-glass styling could make it look like a macOS sheet (P8 polish).
- **Blockers / risks:**
  - There is no central malware or revocation service on Linux. Never imply "checked for malware".
  - Plain-language rules (COPY.md) forbid "signature" and "repository", so the copy must stay concrete ("from Google", "updates itself").
  - A false sense of safety must be avoided: a signed vendor RPM can still do anything.
- **Linux equivalents today:** GNOME Software's Flatpak safety rating, Flathub verified badges, `rpm -K`, PackageKit's untrusted polkit action, Flatseal (third party) for after-the-fact permission review.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)** inside the installer (F-16), effort **M**. It is the missing trust step between "double-click" and "drag", and it has a real Linux signal to show. Kiwi itself: Skip.

## B. Stores and updates

### The Mac App Store, and app updates
- **Introduced / changed:** 10.6.6 (2011). Redesigned in 10.14 Mojave (Discover, Create, Work, Play, Develop, Categories, Updates tabs). Privacy "nutrition labels" were added in Big Sur. Update settings moved from System Preferences into the App Store's own Settings in Ventura. **macOS 15.1 Sequoia** added "Download and install large apps to a separate disk" (apps over 1 GB, APFS external disk). In Tahoe, the App Store-only Launchpad delete path went away (see Launchpad).
- **What it is:**
  - Signed in with an Apple Account, the user clicks **Get** / price → **Install** and authenticates (Touch ID or password). A progress ring shows on the button. The new app's icon appears in Launchpad (in Apps on Tahoe) with a progress pie, and the Dock's Launchpad icon shows progress.
  - **Updates:** the *Updates* section in the sidebar with **Update** per app or **Update All**. A badge on the App Store Dock icon counts pending updates, and the Apple menu shows "App Store… N updates". *App Store → Settings → Automatic Updates* installs them silently. Apps that are running get updated after quit, or the user is asked to quit them.
  - Purchases and reinstall: *Account → Purchased*, with a cloud icon to re-download. Every App Store app is **sandboxed** and signed by Apple.
- **Caveats (on macOS):**
  - Many pro apps are not on the store, because of sandbox limits or Apple's commission.
  - Updates sometimes stall ("Update" spins). Release notes are often "bug fixes".
  - Removal is not offered in the App Store itself (only in Launchpad, before Tahoe).
- **Port to GNOME 50:**
  - **GNOME Software is the App Store**: Flathub plus Fedora repos (on F44 through its downstream **dnf5daemon plugin**; Fedora's spec builds gnome-software with `%bcond packagekit 0` and `Requires: dnf5daemon-server`). Explore / Installed / Updates pages, per-app pages with screenshots, safety ratings and licences.
  - Flatpak updates install automatically when "Automatic Updates" is on (since GNOME 3.30). RPM updates are downloaded and then installed **offline at reboot** ("Restart & Update"), like macOS's "install tonight".
  - Kiwi mappings:
    - The Logo menu's "App Store…" item (overhaul-plan §5.1) opens GNOME Software, and can show "N updates" like macOS's Apple menu.
    - Kiwi's dock can **badge the Software icon** with the update count, and show install progress on app icons through the `com.canonical.Unity.LauncherEntry` D-Bus API (`count`, `progress`, `urgent`). That is the de facto standard Dash to Dock honours, so the installer and others can drive it.
    - "Install progress in Launchpad": while GNOME Software or the installer installs an app, Launchpad shows a placeholder tile with a progress ring. The source is PackageKit / dnf5daemon transaction signals, or simply the LauncherEntry progress of the *installer's* icon.
  - The update count source: GNOME Software has no public count API. Options:
    - (a) Flatpak: `flatpak remote-ls --updates` is a subprocess and should be avoided in the Shell. libflatpak through GI is possible in a helper, not in the Shell.
    - (b) dnf5daemon `rpm.Rpm.list` with the upgrades filter, over the system bus. Read-only calls might not need polkit ⚠.
    - (c) Recommended: a small helper (or the installer, if it runs a background service) that exports the count.
    For P1, just open GNOME Software's Updates page: `gnome-software --mode=updates` or its `set-mode` action through `org.freedesktop.Application.ActivateAction("set-mode", ["updates"])`.
- **Blockers / risks:**
  - The Fedora 44 dnf5 plugin was 8 000 lines of downstream patches, and its behaviour around local files and offline updates differs from PackageKit's ⚠.
  - Do not run Flatpak or DNF queries inside gnome-shell (blocking IO, EGO review).
  - An Apple-style "Get" button flow with accounts does not exist and should not be invented.
- **Linux equivalents today:** GNOME Software, Flathub web, Bazaar (a Flathub store some Fedora spins use), KDE Discover.
- **Kiwi status:** partial in the plan (the Logo menu "App Store…" entry is planned). No badges, no progress.
- **Recommendation:** **Port (P2)**, effort **M**: the Logo menu entry, a dock badge through LauncherEntry, and Launchpad progress tiles. It is cheap, it makes GNOME Software feel like the App Store, and it uses a standard API.

### Software Update (macOS updates)
- **Introduced / changed:** Moved from the App Store into System Preferences → Software Update in 10.14 Mojave. Rapid Security Responses arrived in 13 Ventura and were rarely used. **macOS 26 Tahoe replaced them with Background Security Improvements (BSI)**: the first shipped on 2026-03-17 as "26.3.1 (a)", appear under Privacy & Security, have an "Automatically Install" toggle, and fix WebKit and libraries between point releases.
- **What it is:**
  - *System Settings → General → Software Update* shows "Your Mac is up to date" or the update with **Update Now / Restart Now** and "More info…" release notes. The (i) button next to *Automatic updates* opens toggles:
    - Check for updates.
    - Download new updates when available.
    - Install macOS updates.
    - Install application updates from the App Store.
    - Install Security Responses and system files (XProtect and the like).
  - Notifications: "Updates Available: Install now / Try Tonight / Remind me tomorrow". Laptops must be on power to auto-download.
  - Major upgrades are offered as a separate "Upgrade Now" banner. A badge appears on the System Settings Dock icon and in the Apple menu.
- **Caveats (on macOS):**
  - Long "Preparing…" phases and multiple restarts. Users get nagged without a clean "skip this version".
  - The updater is separate from App Store updates, a long-standing source of confusion.
  - BSIs can rarely break compatibility, and Apple may pull and reissue them.
- **Port to GNOME 50:**
  - **GNOME Software owns OS updates on Fedora**: offline RPM updates at reboot (`pk-offline-update` / the dnf5 offline mechanism), the **Fedora version upgrade banner** ("Fedora Linux 45 Now Available"), and **firmware through fwupd**. The power-off dialog's "Install pending software updates" checkbox is the "Restart & Update" moment.
  - Kiwi mappings:
    - In the Logo menu, "Software Update…" opens GNOME Software's Updates page, with a dot or count when updates are pending. "Restart…" can show "Update and Restart" when an offline update is prepared. The prepared-update marker is `/system-update` (symlink) or the PackageKit/dnf5 prepared-update file ⚠. It is readable without privileges.
    - The Control Center or notch could show a "Restart to Update" live activity, a small extra.
  - System Settings → *About* on GNOME 50 has no update section. Do not fake one there.
- **Blockers / risks:**
  - Detecting a prepared offline update differs between the PackageKit offline path and the dnf5 offline path (`dnf5 offline` writes its own state under `/usr/lib/sysimage/libdnf5/offline/` ⚠). Kiwi must read whichever exists, read-only.
  - Triggering a reboot-install from the Shell needs polkit (`org.freedesktop.packagekit.trigger-offline-update` or dnf5daemon's action), so it is better to delegate to GNOME Software's `reboot-and-install` action.
- **Linux equivalents today:** GNOME Software Updates page, the end-session dialog's update checkbox, `dnf5 offline`, fwupd / GNOME Firmware.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)**, effort **S**: Logo-menu entry, a pending-update dot, and "Update and Restart" in the restart item, all delegating to GNOME Software. It is high Mac-feel for little code, with no privilege in Kiwi.

## C. Removing apps

### Uninstalling by dragging to the Trash (and leftovers)
- **Introduced / changed:** Since OS X 10.0. Apple's own guide still says: open the app's folder and run "Uninstall [App]" if there is one, otherwise drag it from Applications to the Trash. Since 10.10 or so, protected Apple apps (Mail, Music, Books, Notes, Podcasts, Maps, News, Stocks…) cannot be removed. Since 13 Ventura, the **App Management** privacy permission blocks apps from modifying or deleting other apps unless the user grants it (Full Disk Access implies it, and same-team updates are allowed).
- **What it is:**
  - Drag the bundle to the Trash, or press ⌘⌫ in Finder, and authenticate if the user is not an admin. *File → Put Back* restores it until the Trash is emptied.
  - Removing an app that is running fails with "is in use".
  - Leftovers stay behind: `~/Library/Application Support/<App>`, `Preferences/*.plist`, `Caches`, `Containers/<bundle-id>` (sandboxed apps), `Group Containers`, `LaunchAgents`, login and background items (they disappear from the list when the app is gone), and privileged helpers in `/Library/PrivilegedHelperTools` and `/Library/LaunchDaemons`.
- **Caveats (on macOS):**
  - Leftovers are the top complaint, and a whole category of third-party apps (AppCleaner, CleanMyMac, Pearcleaner) exists for it.
  - Background services and system extensions installed by `.pkg`s keep running until removed.
  - Users don't know that apps from `.pkg`s are not fully removed by a drag.
- **Port to GNOME 50:**
  - **Flatpak:** `flatpak uninstall` keeps `~/.var/app/<id>` by default. `--delete-data` removes the data and the permission-store entries, and `--unused` removes orphaned runtimes. GNOME Software's Uninstall removes the app; whether it offers to delete the data ⚠ varies by version.
  - **RPM:** PackageKit `RemovePackages(autoremove=true)` or dnf5daemon `Goal.remove`, with polkit. The rpmdb is a real receipt, so system files go away cleanly. User dot-files in `~/.config/<app>` stay.
  - **AppImage:** the installer moves the file to the freedesktop Trash (recoverable, the true "drag to Trash"), removes the generated `.desktop` and icons, and drops the ledger entry (`src-tauri/crates/application/src/use_cases/uninstall_app.rs`). `~/.config/<app>` stays.
  - **macOS-style leftovers cleanup** for the installer (v1.x): after removal, look up known per-app dirs by desktop id and name (`~/.config/<x>`, `~/.local/share/<x>`, `~/.cache/<x>`, Flatpak `~/.var/app/<id>`). Offer "Also remove settings and data (120 MB)" as an unchecked option, going to the Trash, never a permanent delete. That is better than macOS.
  - **Kiwi:** the dock's Trash (overhaul-plan §5.2) should accept a dragged *app icon* from Launchpad or the dock and treat it as "uninstall" (see Launchpad), mirroring "drag to Trash". Dropping a *file* onto the Trash moves it to the Trash through GIO.
- **Blockers / risks:**
  - Heuristic leftover matching can delete the wrong folder, so offer it only for exact desktop-id matches, always through the Trash, and always opt-in.
  - Kiwi must never delete files itself (CLAUDE.md rule: never delete user files Kiwi did not create). It only asks the owner of the app (installer or GNOME Software) to do it.
- **Linux equivalents today:** GNOME Software Uninstall, `flatpak uninstall --delete-data`, `dnf remove`, Gear Lever (AppImage remove), the GNOME Settings → Apps → *Storage* page (shows data and cache sizes, and can clear the cache).
- **Kiwi status:** none (the dock Trash is planned).
- **Recommendation:** **Port (P2)**, effort **M**: drag an app to the dock Trash → uninstall through the owning installer. It is iconic Mac behaviour, and the safe version is easy once the installer exposes an uninstall API.

### Launchpad delete ("jiggle") mode
- **Introduced / changed:** Launchpad arrived in 10.7 Lion. Holding ⌥ Option, or long-pressing an icon, makes the icons jiggle. An ⓧ appears **only on Mac App Store apps**: click it, confirm with "Delete", and the app goes to the Trash. **macOS 26 Tahoe removed Launchpad entirely**, replacing it with the *Apps* view (a Spotlight-based, alphabetical grid with categories, opened by the same four-finger pinch). Apps has **no delete mode**. Apple's user guide was reported to still describe the old flow ⚠.
- **What it is:**
  - Jiggle mode: icons wobble; drag to rearrange or to make folders; an ⓧ badge on deletable apps; Esc or a click on the background exits.
  - The confirmation reads "Delete '<App>'? This app will be deleted immediately. You can't undo this action." (wording varies). Re-download is possible from App Store → Purchased.
  - Non-App-Store apps show no ⓧ. Users must use Finder.
- **Caveats (on macOS):**
  - The App-Store-only rule confuses users ("why can't I delete Chrome?").
  - Accidental reordering in jiggle mode.
  - Tahoe's removal of Launchpad itself is one of its most criticised changes, with third-party replacements (LaunchOS, LaunchHome, LaunchPal) filling the gap. This is a chance for Kiwi to offer what macOS dropped.
- **Port to GNOME 50:**
  - GNOME's app grid already has a long-press / drag "edit" behaviour (reorder, folders) but no delete. Kiwi's Launchpad (overhaul plan: "part of the dock and app grid") adds:
    1. Hold ⌥/Alt (or long-press) to enter jiggle mode: a CSS keyframe wobble on `AppIcon` actors (respect Reduced Motion: show the ⓧ badges without the wobble).
    2. An ⓧ badge only on apps Kiwi can **ask someone to remove**, the Linux version of the "App Store only" rule:
       - **Flatpak apps** (the desktop file lives under a Flatpak `exports/share/applications` dir, or has `X-Flatpak=<id>`): uninstall through GNOME Software's `uninstall` GAction (`org.gnome.Software` implements `org.freedesktop.Application`; `ActivateAction("uninstall", [<app-id>])`), which shows GNOME Software's own confirmation. Alternatively through the installer, if it gains Flatpak support.
       - **Installer-managed AppImages** (`X-Installer-Managed=true` in the desktop file, already written by `desktop_entries.rs:107`) and **installer-ledger RPMs**: through the installer's uninstall API (see the integration plan). It shows the macOS-style "Move '<App>' to the Trash?" alert from `TrashConfirmAlert.svelte`.
       - **Other RPMs:** no ⓧ in v1, so system apps like Files and Settings are protected, as on macOS. Later: an ⓧ that opens GNOME Software's details page (`details-pkg` action) for user-installed RPMs.
    3. After removal, the icon "poofs" (the dock already plans a poof animation), and `Shell.AppSystem` drops it on `installed-changed`.
  - All of this is Shell-side GJS on `AppDisplay` / `AppIcon` (GNOME 50 `js/ui/appDisplay.js`), injected through Kiwi's `CleanupRegistry`.
- **Blockers / risks:**
  - `AppDisplay` internals change between Shell versions, so go through `lib/compat.js`.
  - D-Bus calls must be async and must time out; the installer may not be installed.
  - The GNOME Software `uninstall` action needs GNOME Software to be running or activatable. It is a GApplication with `DBusActivatable=true`, so it is activatable. Calling it starts the app's window, which is acceptable, since it shows its confirmation.
  - Do not offer ⓧ for apps whose owner cannot be determined.
- **Linux equivalents today:** none in GNOME. KDE's launcher has "Uninstall or manage add-ons" that opens Discover.
- **Kiwi status:** partial. `apps/launchpadApp.js` only toggles Show Apps; it is being replaced by the new Launchpad. No delete mode.
- **Recommendation:** **Port (P2)**, effort **M**. Restores a feature Tahoe removed, and the installer and GNOME Software already provide the uninstall back ends.

### Downloads stack in the Dock (context for the integration)
- **Introduced / changed:** Stacks arrived in 10.5 Leopard. Fan, Grid and List views, *Sort by* (Name, Date Added, Date Modified, Date Created, Kind) and *Display as* (Folder / Stack) have been stable for years. The Downloads icon bounces once when a download finishes in Safari.
- **What it is:**
  - The Downloads folder sits to the right of the Dock separator. Clicking it fans out the newest items, nearest to the Dock, with "Open in Finder" at the end. Items can be dragged out.
  - A finished download bounces the stack. Safari shows a progress bar on the file icon. Opening a `.dmg` or `.pkg` from the stack starts the install flow.
- **Caveats (on macOS):** List view puts the newest at the top while Fan puts the newest at the bottom, a common complaint. "Automatic" view choice is unpredictable.
- **Port to GNOME 50:** Kiwi already has a fan stack (`apps/downloadsStack.js`, `Gio.FileMonitor` on Downloads, opening through `launch_default_for_uri`). In the overhaul it becomes part of Kiwi's own dock (overhaul-plan §5.2). Additions for the install flow:
  1. Show partial downloads (`*.part`, `*.crdownload`, `*.download/`) as greyed items with a progress estimate based on file growth. A small bounce when the rename to the final name happens (`G_FILE_MONITOR_EVENT_RENAMED`).
  2. A package badge (a small "box" glyph) on `.rpm` / `.AppImage` / `.flatpakref` items, so "this is an app you can install" is visible.
  3. Clicking an app package opens the installer, through the default handler. If the installer is not the default, fall back to GNOME Software for `.flatpakref` / `.flatpak`, and use the installer explicitly for RPM/AppImage when present (`Gio.DesktopAppInfo.new('io.github.blueyzx64.Installer.desktop')`).
- **Blockers / risks:** Kiwi must not change `mimeapps.list` itself; the installer's "Make Default" sheet owns that (F-50). File-growth "progress" is a guess, so show it as indeterminate unless the browser exposes more (it doesn't on Linux).
- **Linux equivalents today:** none in GNOME's dash. Dash to Dock has no Downloads stack.
- **Kiwi status:** have (as a Dash to Dock add-on). It moves into Kiwi's dock in the overhaul.
- **Recommendation:** **Port (P1 core)**, effort **S**, carried by the dock work. It is the entry point of the Mac install flow.

## D. Apps running in the background

### Login Items and background items management (Ventura+), and "Allow in the Background" notifications
- **Introduced / changed:** **macOS 13 Ventura** moved login items to *System Settings → General → Login Items* and added an **"Allow in the Background"** list, the Background Task Management (`backgroundtaskmanagementd`) system. It also added the `SMAppService` API (replacing `SMLoginItemSetEnabled` and `SMJobBless`). **macOS 15 Sequoia** renamed the pane *Login Items & Extensions*, with **App Background Activity** and all extension types grouped. Ventura's first releases had a bug that showed "Background Items Added" on every boot.
- **What it is:**
  - **Open at Login:** a list of apps, documents and servers with ＋/－ buttons. The Dock's right-click menu on an app offers *Options → Open at Login*.
  - **Allow in the Background / App Background Activity:** an *allowlist* of the launch agents, daemons and helpers each app registered. Each has a toggle and cannot be removed. Apple DTS: "it doesn't show what will be launched at login, it shows what is *allowed* to be".
  - **Notifications:** when an app registers a new background item, a system notification appears: "Background Items Added: '<App>' added items that can run in the background. You can manage this in Login Items Settings." Clicking it opens the pane.
  - `SMAppService.register()` → status `requiresApproval` until the user acts. Daemons also need an admin. MDM can lock items. `sfltool dumpbtm` dumps the database.
- **Caveats (on macOS):**
  - Names in the list are often developer names or bundle ids, not app names, so users can't tell what is what.
  - Disabling an item can silently break the app.
  - Duplicate "added" notifications. Items stay after the app is deleted in some cases.
- **Port to GNOME 50:**
  - **The Background portal is the exact analogue.** `org.freedesktop.portal.Background.RequestBackground(parent_window, {reason, autostart, commandline, dbus-activatable})` asks the user, stores the answer in the permission store (table `background`), and, with `autostart=true`, writes an XDG autostart file. `SetStatus({message})` (v2) gives a one-line status.
  - GNOME Shell (since 44) shows **Background Apps** in Quick Settings: Flatpak apps running with no window, each with a close button and an "App Settings" link. GNOME 50 betas lost it, and xdg-desktop-portal 1.21.1 restored it (Fedora bug 2457805).
  - **GNOME 50 Settings → Apps → <app> → "Run in Background — Allow activity when the app is closed"** is a switch backed by the `background` portal permission. It is shown only when the app has an entry in the permission store (`cc-applications-panel.c`, `get_background_allowed`). That is the GNOME version of the "Allow in the Background" toggle, but per app and only for apps that asked.
  - **Autostart:** `~/.config/autostart/*.desktop` (XDG Autostart spec; `Hidden=true` disables, `X-GNOME-Autostart-enabled=false` too). GNOME Tweaks used to manage it (its Startup Applications page was removed in recent Tweaks ⚠). GNOME Settings has no "Open at Login" list. A gnome-control-center issue (#797) asks for "Start at login" next to "Run in background".
  - **Kiwi plan:**
    1. The dock's right-click **"Open at Login"** (already in overhaul-plan §5.2). For Flatpak apps, write nothing: ask the user to use the app's own setting, or open Settings → Apps. Writing autostart files for sandboxed apps bypasses the portal. For host apps, write or remove `~/.config/autostart/<desktop-id>` as a copy of the app's desktop file with `X-Kiwi-Created=true`. Kiwi created it, so it may remove it, in line with the CLAUDE.md file rule.
    2. A **"Login Items" page** in Kiwi prefs (GTK4/libadwaita, already the prefs stack) that lists `~/.config/autostart` plus the system `/etc/xdg/autostart`. System items are read-only, with "Disable" writing a `Hidden=true` override into `~/.config/autostart` — a file Kiwi creates and therefore may delete. Also list the permission store's `background` table (`org.freedesktop.impl.portal.PermissionStore.Lookup("background","background")`) with toggles. That is a full macOS-style *Login Items & Extensions* page.
    3. **"Background Items Added" notification:** Kiwi watches `~/.config/autostart` (Gio.FileMonitor) and the permission store's `Changed` signal. When an app adds an autostart entry or gets background permission, Kiwi posts a Shell notification: "'<App>' can now run in the background. Manage in Login Items." The action opens the prefs page. Opt-in setting, since GNOME already asked in the portal dialog.
- **Blockers / risks:**
  - The permission store is on the session bus and is not a public "user API"; changing it is what GNOME Settings does, so mirror that.
  - Non-Flatpak apps can autostart through systemd user units (`~/.config/systemd/user/*.service`, `default.target.wants`) and never show up in either list. Listing them read-only is fine; toggling them means `systemctl --user` over D-Bus (`org.freedesktop.systemd1`), which is fine in prefs but not in the Shell.
  - The EGO review dislikes extensions writing outside their dir, so all writes go through prefs, are marked, and are reversible.
- **Linux equivalents today:** Quick Settings Background Apps, Settings → Apps → Run in Background, GNOME Tweaks (older) or Ignition (a Flathub autostart manager) and Flatseal.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)**, effort **M**: the dock's Open at Login, a prefs Login Items page and the opt-in notification. It fills a real GNOME gap (no Open at Login list) with the macOS model, using only standard files and the portal.

### App Sandbox and privacy prompts (TCC)
- **Introduced / changed:**
  - The App Sandbox has been mandatory for the App Store since 2012.
  - TCC (Transparency, Consent, and Control): Contacts and Calendars in 10.8. Camera and microphone in 10.14 Mojave. **10.15 Catalina** added prompts for Desktop, Documents, Downloads, network and removable volumes, plus Screen Recording and Input Monitoring.
  - 13 Ventura added App Management. **15 Sequoia** made Screen Recording re-ask **monthly** ("Allow for One Month"; weekly in early betas) and added Local Network prompts. Tahoe keeps this model.
- **What it is:**
  - A modal alert the first time an app touches a protected resource: "'<App>' would like to access files in your Documents folder." **Don't Allow / Allow** (or OK). The developer's purpose string is shown under the title.
  - Afterwards the choice lives in *System Settings → Privacy & Security → <category>* (Location Services, Contacts, Calendars, Reminders, Photos, Bluetooth, Microphone, Camera, Motion & Fitness, HomeKit, Speech Recognition, Media & Apple Music, Files & Folders, Full Disk Access, Focus, Accessibility, Input Monitoring, Screen & System Audio Recording, Automation, App Management, Developer Tools, Local Network…), each listing apps with toggles.
  - Some, like Accessibility and Full Disk Access, can't be prompted for; the app has to send the user to Settings ("Open System Settings").
  - The sandbox limits apps to their container plus files the user picks through the open/save panel (powerbox).
- **Caveats (on macOS):**
  - Prompt fatigue, especially Sequoia's monthly screen-recording nags.
  - Unsandboxed apps get wide access once allowed. TCC has had many bypass CVEs.
  - Developers hate the "relaunch required" cases (Screen Recording).
- **Port to GNOME 50:**
  - **Portals are TCC**: File Chooser (powerbox), Camera, Location, ScreenCast and Remote Desktop (with restore tokens for "remember"), Screenshot, Global Shortcuts, Input Capture, Background, Notification, Wallpaper, USB and more. The answers live in the permission store (`~/.local/share/flatpak/db/`), and **GNOME 50 Settings → Apps** shows the switches (Search, Notifications, Run in Background, Screenshots, Change Wallpaper, Sounds, Inhibit Shortcuts, Camera, Microphone, Location Services, Global Shortcuts, Files & Links, Storage). Settings warns "App is not sandboxed" for host apps.
  - The portal dialogs are drawn by xdg-desktop-portal-gnome, outside the Shell. Kiwi can't restyle those GTK windows (no GTK theming any more), but the **Shell-drawn** ones (the polkit authentication dialog, network and Bluetooth auth prompts, and the "Install Extension" dialog) can get Kiwi's sheet styling. Which portal dialogs GNOME 50 draws in the Shell versus in xdg-desktop-portal-gnome needs checking per portal ⚠.
  - A **"Privacy & Security" view across apps** (macOS's per-*category* list rather than GNOME's per-*app* list) could be a Kiwi prefs page that reads the permission store tables (`devices` camera/microphone, `location`, `background`, `notifications`, `screenshot`, `wallpaper`) and shows "Apps that can use the camera" with toggles. GNOME 50 lacks this. A useful P3 addition.
  - The installer (Tauri, not Flatpak) never needs TCC-like prompts. Polkit is its only consent step.
- **Blockers / risks:**
  - Host (RPM/AppImage) apps bypass portals entirely, so a privacy page would show only sandboxed apps and must say so.
  - The permission store's table layout is semi-internal.
- **Linux equivalents today:** GNOME Settings → Apps (per app), Flatseal (static Flatpak permissions), the Camera/Microphone indicators in the top bar (GNOME shows privacy indicators, like macOS's orange and green dots).
- **Kiwi status:** none (Kiwi's notch planned "screen recording" live activity is the indicator side).
- **Recommendation:** **Later (P3)**, effort **M**: a per-category Privacy page in prefs. GNOME already covers the prompts, so only the macOS-style overview is missing.

## E. First run

### Setup Assistant and onboarding
- **Introduced / changed:** Since OS X 10.0, with steps added every release:
  - Accessibility at the start (10.14+).
  - Screen Time, Siri, and an **Appearance** choice (Light/Dark/Auto) in 10.14/10.15.
  - FileVault, Touch ID and Apple Pay (Apple silicon era).
  - "Update Mac" and **"Welcome to Mac"** screens for major upgrades.
  - Tahoe 26 adds Liquid Glass choices.
  - After a major upgrade, a short assistant runs for the new privacy or iCloud terms.
- **What it is:** A full-screen, modal, centred-card flow with a "Hello" animation in many languages, then:
  1. Language / Country or Region.
  2. Accessibility (Vision, Motor, Hearing, Cognitive, or Not Now).
  3. Wi-Fi.
  4. Data & Privacy.
  5. **Migration Assistant** (from a Mac, Time Machine or PC, or Not Now).
  6. Apple Account sign-in (2FA).
  7. Terms.
  8. Create a computer account (name, account name, password, hint).
  9. Location Services, Time Zone, Analytics.
  10. Screen Time, Siri / Apple Intelligence.
  11. Touch ID, Apple Pay.
  12. FileVault, iCloud Keychain.
  13. **Choose your look** (Light, Dark, Auto).
  14. "Setting up your Mac…", then the desktop.

  Each card has a large icon, a title, two lines of text, a primary **Continue** and secondary **Set Up Later / Not Now** links, and a back arrow. The layout is consistent and every step is skippable where possible.
- **Caveats (on macOS):** Apple Account and iCloud upsells. Repeated post-upgrade screens irritate users. Some choices (FileVault) are hard to understand.
- **Port to GNOME 50:**
  - **gnome-initial-setup** (version 50) already covers the system side. Its pages are welcome, language, keyboard, network, privacy (location and problem reporting), timezone, software (third-party repositories), parental-controls, account, password and summary. **GNOME Tour** (gnome-tour 50) and GNOME Shell's "Welcome to GNOME" dialog (`org.gnome.shell welcome-dialog-last-shown-version`) are the "Welcome to Mac" equivalent.
  - **Kiwi needs its own "Setup Assistant" for Kiwi choices**, as overhaul-plan §9 says (dock side, logo, glass). The macOS-faithful steps:
    1. **Welcome:** "Hello" animation; "Make GNOME feel like a Mac".
    2. **Choose your look:** Light / Dark / Auto (writes `org.gnome.desktop.interface color-scheme`) and accent, plus Kiwi glass (faux glass, reduced transparency, high contrast).
    3. **Menu bar:** logo (Fedora or Kiwi), app menu on or off, clock style.
    4. **Dock:** position (bottom / left / right), size, magnification, auto-hide, "Minimize into app icon". Live preview.
    5. **Windows:** traffic lights on the left (writes `button-layout` `close,minimize,maximize:` **after saving the old value** for restore), tiling, rounded corners.
    6. **Gestures & keyboard:** Mission Control / Launchpad gestures, "Super acts as ⌘ in menus" (open question 4 in the plan).
    7. **Apps:** "Use Installer to open downloaded apps" → the installer's Make Default (F-50), only if the installer is installed. "Open GNOME Software for more apps".
    8. **Done:** "You're all set", with a link to Kiwi Settings.
  - Where it lives. Three options, with the recommendation in the integration plan:
    - (a) a "Welcome" flow inside Kiwi's prefs (GTK4 + libadwaita `Adw.Carousel` / `Adw.NavigationView`, already shipped with the extension, EGO-safe);
    - (b) a route in the installer's Tauri/Svelte stack (matches the DMG look, but needs the installer installed);
    - (c) a separate GTK4/libadwaita "Kiwi Setup" app (most native, but one more thing to package).
  - The trigger: on first `enable()` with schema key `onboarding-done=false`, Kiwi calls `this.openPreferences()` with a "welcome" page hint (a GSettings key `prefs-open-page`, read by prefs.js). The trigger is deferred until the session is idle and never runs over gnome-initial-setup (session mode `initial-setup`) or GNOME's own welcome dialog. Kiwi waits until that dialog is dismissed, or sets nothing in it.
- **Blockers / risks:**
  - EGO: extensions must not open windows on every login, so run once and remember.
  - Writing GNOME keys (`button-layout`, `color-scheme`, dock and hot-corner keys) requires saving the originals in Kiwi's schema and restoring them on reset or uninstall (overhaul-plan §9's "restore the user's GNOME settings").
  - Kiwi's `disable()` runs on every screen lock (no `session-modes` in `metadata.json`), so a restore must happen only on a real uninstall or reset, never on disable. Otherwise the lock screen would undo the user's choices.
- **Linux equivalents today:** gnome-initial-setup, GNOME Tour, distro welcome apps (Ubuntu Welcome, Fedora's "Welcome to Fedora" in older releases).
- **Kiwi status:** none.
- **Recommendation:** **Port (P1 core)**, effort **M**, as a prefs welcome flow first. It is the single best moment to set every Kiwi choice at once, and it de-risks the many settings the overhaul adds.

### Migration Assistant
- **Introduced / changed:** 10.3 Panther. It became part of Setup Assistant later, and gained Windows PC migration (10.7+), Time Machine sources, and wireless peer transfer with a security-code check. Apple Silicon era: from Intel Macs too.
- **What it is:** It transfers **user accounts, apps, documents and settings** from another Mac, a Time Machine backup or a startup disk, or from a Windows PC. Steps:
  1. Choose a source.
  2. Confirm that the matching security code shows on both Macs.
  3. Pick categories: Applications, each user (Documents, Music…), Other files and folders, Computer & Network settings. Sizes are calculated first.
  4. Handle account clashes: replace (optionally keeping the old one in "Deleted Users") or rename.
  5. Set the password for migrated admin accounts.
  6. A progress screen that can take hours.
  The old Mac is left intact.
- **Caveats (on macOS):** Slow and sometimes stalls. It can bring over cruft (old kexts, launch agents). Apps from other architectures may not run. Mail accounts need re-setup.
- **Port to GNOME 50:**
  - There is no GNOME Migration Assistant. The pieces exist: **Déjà Dup / GNOME Backups** (restore a backup), **Pika Backup** (borg), and `flatpak list --app --columns=application` for reinstalling apps.
  - A **Kiwi-sized** equivalent is realistic, and the installer is its natural home: **"Bring your apps and Kiwi setup to this computer"**.
    - **Export** a small JSON "migration profile": Flatpak app ids and remotes, the installer ledger (AppImages and their source files, RPM names), a Kiwi settings dump (`dconf dump /org/gnome/shell/extensions/kiwi/` plus the GNOME keys Kiwi manages), dock favourites (`org.gnome.shell favorite-apps`), and the wallpaper path.
    - **Import:** install the Flatpaks through GNOME Software or libflatpak, re-install the RPMs through the installer's normal polkit flow, copy the AppImages if present, apply the settings. The step list is the Migration Assistant UI: source → categories with sizes → progress.
    - Documents are out of scope: point to GNOME Backups.
- **Blockers / risks:**
  - Cross-distro moves (RPM → deb) won't map. Flatpaks are the portable part.
  - Copying settings blindly can import Kiwi keys from another Kiwi version, so validate against the schema.
  - Don't promise full account migration.
- **Linux equivalents today:** Déjà Dup / GNOME Backups, Pika Backup, `dconf dump`/`load`, KDE's "Welcome Center" export (partial).
- **Kiwi status:** none.
- **Recommendation:** **Later (P3)**, effort **L**: a profile export/import in the installer or Kiwi prefs. Nice for switchers and new machines, but no core macOS feel depends on it.

---

## Owner's app-installer: assessment and integration plan

### 1. Current state (what is real, what is mocked), with file references

The repo has a single squashed commit (`8c7438f`, 2026-10-26). It reports 418 Rust tests, 385 frontend tests and 92 Playwright specs, built by an agent swarm with ten adversarial review rounds (`docs/VERIFICATION.md`).

| Area | State | Evidence |
|---|---|---|
| Stack | Tauri 2.12 + WebKitGTK 4.1, SvelteKit SPA (Svelte 5 runes, strict TS), Rust workspace split into `domain` / `application` / `infrastructure` crates (dependency rule enforced by the compiler) | `docs/adr/0001…0003`, `src-tauri/Cargo.toml`, `src-tauri/crates/*` |
| Window / look | 600×400, `decorations:false`, `transparent:true`; macOS AppKit look in CSS (traffic lights placed by GNOME `button-layout`, sheets, alerts, Inter font, tokens for light, dark and high contrast, a motion spec with reduced-motion variants) | `src-tauri/tauri.conf.json`, `src/lib/ui/tokens.css`, `WindowChrome.svelte`, `WindowControls.svelte`, `docs/design/DESIGN-SYSTEM.md`, ADR-0006 |
| Open a file | **Real.** argv `%f`, single-instance forwarding, drop onto the window (F-06), portal file chooser (F-07); content sniffing by magic bytes; lossless non-UTF-8 paths | `src-tauri/src/cli.rs`, `dropzone.rs`, `lib.rs` |
| Inspect without executing | **Real.** AppImage: ELF → SquashFS via `backhand`, reads `.desktop`, `.DirIcon`, metainfo; Type-1 and DwarFS → unsupported. RPM headers via the `rpm` crate; `.deb` control parsed (shown as "made for Ubuntu") | `crates/infrastructure/src/inspect/{appimage,rpm,deb,elf}.rs`, ADR-0005 |
| Compatibility | **Real.** Wrong family, wrong architecture, already installed (same, older, newer → "Update"), missing FUSE 2, unsupported | `crates/domain/src/compat.rs`, `docs/design/COPY.md` |
| AppImage install | **Real.** Atomic copy to `~/Applications`, `0755`, generated `.desktop` with `X-Installer-Managed=true` and `X-Installer-Source`, hicolor icons, ledger JSON | `appimage_store.rs`, `desktop_entries.rs:107-108`, `ledger.rs` (`$XDG_DATA_HOME/io.github.blueyzx64.Installer/ledger.json`) |
| RPM install | **Wired, not proven on a real Fedora.** PackageKit 1.x adapter over zbus (simulate, then install; `WAITING_FOR_AUTH` → permission shade); startup probe picks PackageKit, else dnf5daemon (cargo feature), else "unavailable", with a one-time lazy switch to dnf5daemon | `crates/infrastructure/src/packagekit/*`, `dnf5daemon/*`, `src-tauri/src/system_backend.rs`, `composition.rs` |
| Library and uninstall | **Real for AppImage** (GIO Trash, entry removal, ledger forget, reconcile). RPM removal through the backend with an `uninstall_plan` ("also removes N items") | `use_cases/uninstall_app.rs`, `uninstall_plan.rs`, `features/library/*`, `TrashConfirmAlert.svelte` |
| Default handler | **Real.** GIO `set_as_default_for_type` for `application/x-rpm`, `application/vnd.appimage`, `application/x-iso9660-appimage`; a one-time "Make Default / Not Now" sheet | `defaults.rs` (`DESKTOP_ID = io.github.blueyzx64.Installer.desktop`), `features/default-handler/*` |
| Appearance | **Real.** Settings portal (scheme, accent, contrast), GTK decoration layout for `button-layout`, `enable-animations` | `crates/infrastructure/src/appearance.rs` |
| Mock mode | **Real.** Every gateway has an in-browser mock with `?scenario=` stories | `src/lib/infrastructure/mock/*`, `docs/DEVELOPMENT.md` |
| Packaging | **Scaffolded.** `pnpm tauri build --bundles rpm,appimage` with GPG signing in `release.yml`; Copr spec and Makefile; metainfo; licence still a placeholder (MIT, "ASK O") | `.github/workflows/release.yml`, `.copr/installer.spec`, `src-tauri/linux/*` |
| Not built | Flatpak bundles or refs, AppImage updates (zsync), trust or untrusted notice (F-16), drag a tile to Trash (F-44), leftovers cleanup, translations (strings are externalised), any D-Bus or CLI API for other programs | `docs/product/FEATURES.md` "Parked" |

**Doc drift found** (fix in the installer repo):
- `README.md` still says ".rpm is not connected yet … uses a stand-in", but `composition.rs` wires `AnySystemPackages::detect()` (PackageKit → dnf5daemon → unavailable).
- `docs/platform/fedora-gnome.md` and `DESIGN-SYSTEM.md` say "GNOME 51 added a Reduced Motion setting". The GNOME **50** release notes announce Reduced Motion (Accessibility → Seeing), so the installer's reduced-motion path matters on Kiwi's target too.
- **Desktop-id mismatch:** `defaults.rs:13` registers `io.github.blueyzx64.Installer.desktop` as the MIME default, and the Copr spec installs that name. But `release.yml` builds with Tauri's bundler, which names the file after `productName` (`Installer.desktop`), and the metainfo `launchable` says `Installer.desktop`. In the Tauri-built RPM, "Make Default" would likely point at a desktop id that does not exist ⚠ (verify with `rpm -qlp`). Pick one id (the reverse-DNS one) everywhere.

### 2. Gaps against the macOS experience
1. **No Flatpak**, which on Fedora/GNOME is the "App Store" format. `.flatpakref` / `.flatpak` downloads from Flathub "Install" buttons are the most common app downloads after AppImage.
2. **No trust step** (Gatekeeper analogue, F-16 parked): unsigned RPMs with root scriptlets look exactly like signed vendor RPMs.
3. **No updates** for AppImages (macOS apps update themselves via Sparkle or the App Store). The AppImage `.upd-info` section (zsync, `gh-releases-zsync`) can be read without executing, so updates are feasible. There is also no "this RPM adds an update channel" note.
4. **No "move the download to the Trash"** after a successful install (Installer.app offers it).
5. **Leftovers** (`~/.config`, `~/.local/share`, `~/.var/app`) are not offered for removal.
6. **No API for other programs:** Kiwi's Launchpad or dock cannot ask it to uninstall, list managed apps or show progress.
7. **No first-run onboarding** beyond the default-handler sheet.
8. **Library scope:** only apps it installed (F-45 "Later"), unlike Launchpad, which shows everything. That is fine if Kiwi's Launchpad is the "everything" view and the installer is the back end.
9. **No progress outside its window:** no LauncherEntry progress, no notification when a long install finishes while the window is minimised.

### 3. Risks
| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Fedora 44's GNOME Software no longer uses PackageKit**: the spec has `%bcond packagekit 0` and `Requires: dnf5daemon-server`, and the maintainer calls this "the decided direction". PackageKit (with the dnf5 backend) still exists, but may not be on a fresh Workstation ⚠. The RPM's `Requires: PackageKit` then pulls in a second, otherwise unused daemon stack. | Two package daemons, two polkit policies, and a dnf5daemon adapter that is feature-gated and 70% verified (interface names marked ⚠ in the code) | On Fedora, make **dnf5daemon primary** (it is what GNOME Software uses, and its polkit action is already installed via `dnf5daemon-server-polkit`) and PackageKit the fallback. Drop `Requires: PackageKit` in favour of `Requires: dnf5daemon-server` on F44+. Verify on a fresh F44 VM. |
| R2 | PackageKit 2.0 (planned by its maintainer in H2 2026) breaks the API. VERIFICATION.md notes that upstream main renamed the bus name to `org.freedesktop.packagekit1` | The PackageKit adapter silently becomes "unavailable" | R1 makes this moot on Fedora. Keep the probe. |
| R3 | **Target mismatch:** the installer is "Fedora 45 / GNOME 51 first, 44/50 minimum", while Kiwi supports **GNOME 50 / Fedora 44 only** | Integration is tested on different stacks | Make F44/GNOME 50 a first-class CI and smoke target for the integration features. |
| R4 | Root scriptlets in third-party RPMs (no sandbox) | A malicious RPM owns the machine after one drag | F-16 trust step (§A Gatekeeper), and show the scope ("Installs for everyone"). |
| R5 | Undecorated, transparent WebKitGTK window on GNOME Wayland (no shadow, own traffic lights) | Kiwi's rounded corners, window controls in the menu bar and Genie effect may double-decorate or misbehave | Kiwi skips decoration effects for windows with `wm_class`/app id `io.github.blueyzx64.Installer` (or for any client-side-decorated, undecorated window); the installer keeps its own controls. Test together. |
| R6 | Desktop-id mismatch (§1) | Make Default may not stick; Kiwi can't find the app by id | One reverse-DNS id everywhere; add a CI check. |
| R7 | EGO rules for Kiwi: no bundled binaries, no blocking IO, no privileged actions | Integration must be optional and async | Kiwi only talks to the installer over D-Bus with timeouts, and degrades when it is absent. |
| R8 | Ledger written by one process, read by others | Corruption if Kiwi writes it | Kiwi never touches `ledger.json`; it uses the API. |
| R9 | Licence placeholder (MIT) vs Kiwi's GPL | Fine for separate programs talking over D-Bus | Decide the licence before publishing. |

### 4. How it should integrate with Kiwi

Principle: **Kiwi is the shell (Finder, Dock, Launchpad). The installer is the "Installer.app plus the uninstall back end".** They talk through files that already exist (desktop files, MIME defaults) and a small D-Bus API. Neither depends on the other being installed.

#### 4.1 The contract: a session D-Bus API on the installer (new)
Add a D-Bus-activatable service (a `.service` file in `/usr/share/dbus-1/services/`), so Kiwi can call it when the installer is not running. Tauri's single-instance plugin already uses D-Bus on Linux. Expose a separate, versioned interface with zbus in the shell crate (the composition root), backed by the existing use cases:

```
bus name   io.github.blueyzx64.Installer
object     /io/github/blueyzx64/Installer
interface  io.github.blueyzx64.Installer1
  Open(s path, s parent_window)                 → ()        # same as argv; shows the DMG window
  ListManagedApps()                             → a(sssb)   # app_id, desktop_id, source(appImage|systemPackage), can_uninstall
  OwnsDesktopId(s desktop_id)                   → (b owned, s app_id)
  Uninstall(s app_id, s parent_window)          → ()        # shows TrashConfirmAlert in the installer's own window; result arrives by signal
  signal AppsChanged()
  signal UninstallFinished(s app_id, s outcome)   # removed | cancelled | failed:<code>
  signal Progress(s preview_id, s phase, i percent)  # optional, for the dock and notch
  property Version u
```
- Rule: the **confirmation UI always lives in the installer**. Kiwi never removes anything itself, and the user always sees who is acting (the macOS confirm comes from the system, too).
- Mirror `Progress` into `com.canonical.Unity.LauncherEntry` for `application://io.github.blueyzx64.Installer.desktop` (`progress`, `progress-visible`), so *any* dock (Kiwi's, or Dash to Dock) shows install progress on the installer icon with no Kiwi-specific code.
- IPC-contract rule 7 applies: update the DTOs, both gateways and `ipc-contract.md` together. The D-Bus surface is shell-crate only and calls the same use cases.

#### 4.2 Double-clicking downloads, and the Downloads stack
1. Files or the Kiwi stack opens a package → MIME default → the installer (F-50 "Make Default", offered once). Kiwi needs **no change** for this path (`launch_default_for_uri` at `apps/downloadsStack.js:90`).
2. In Kiwi's new dock stack:
   - Show a package badge on `.rpm` / `.AppImage` / `.flatpakref`.
   - If the default handler for the type is *not* the installer but the installer is installed, the right-click menu offers "Open with Installer" (`Gio.DesktopAppInfo.new(id).launch([file])`).
   - Show partial downloads, and a bounce on completion.
3. After a successful install from `~/Downloads`, the installer's Done view offers **"Move <file> to the Trash"** (GIO trash, recoverable). The stack updates through its file monitor.
4. **Dock and notch feedback:** the installer's LauncherEntry progress → Kiwi's dock shows a progress bar on the installer icon, and the notch (v3 live activities, overhaul-plan §5.6 "download progress") shows "Installing Lumen Notes… 40%". On success, a short "fly to dock / Launchpad" animation in Kiwi is triggered by `AppsChanged` plus the `Shell.AppSystem` `installed-changed` signal (the new app id is the one not seen before).

#### 4.3 Launchpad delete (jiggle) mode calling the installer's uninstall
- In jiggle mode, Kiwi decides which apps get an ⓧ:
  1. **Installer-owned:** the desktop file has `X-Installer-Managed=true` (AppImage, readable from `Gio.DesktopAppInfo.get_string`), or `OwnsDesktopId()` returns true (RPMs recorded in the ledger). ⓧ → `Uninstall(app_id, parent_window)`. The installer shows its "Move 'X' to the Trash?" / "Remove 'X'? You'll be asked for your password." alert. On `UninstallFinished(removed)` Kiwi plays the poof. On `cancelled` the wobble continues.
  2. **Flatpak apps:** ⓧ → `org.gnome.Software` `ActivateAction("uninstall", [<flatpak app id>])` (GNOME Software shows its own confirmation). Later, the installer can own Flatpak too (gap 1), and the same `Uninstall` path covers it.
  3. **Everything else:** no ⓧ, matching macOS's "only App Store apps".
- Dragging an app icon from Launchpad or the dock onto the dock **Trash** does the same thing as the ⓧ.
- With no installer present, only rule 2 applies.
- `parent_window`: Kiwi is the Shell and has no xdg-foreign handle to give, so pass `""`. The installer centres its alert window on its own and activates it with a startup-notification token (Kiwi launches through `global.create_app_launch_context`, so focus-stealing prevention lets it raise).

#### 4.4 A Kiwi first-run onboarding (Setup Assistant)
| Option | Pros | Cons |
|---|---|---|
| **A. Inside Kiwi prefs** (GTK4 + libadwaita, `Adw.Carousel` + `Adw.NavigationView`, opened once by `openPreferences()`) | Ships with the extension (EGO-safe); writes Kiwi GSettings directly; works with no installer; one codebase | The look is libadwaita, not the installer's AppKit-CSS look |
| B. A route in the installer's Svelte stack (`/welcome`) | Same look as the DMG window; reuses tokens, motion and sheets; good when Kiwi is installed *through* the installer | Only exists if the installer is installed; Rust must write Kiwi's schema (needs the schema dir from the extension: `gio::SettingsSchemaSource::from_directory(~/.local/share/gnome-shell/extensions/kiwi@kemma/schemas)`); two codebases know the Kiwi keys |
| C. A separate GTK4/libadwaita "Kiwi Setup" app (Rust gtk4-rs or Vala) | Most native; could also host Login Items and the Privacy page | Another package to ship and keep in sync; EGO can't include it |

**Recommendation:** **A first, B as a skin later.**
- Build the steps once as a **declarative step list** (JSON: id, title, body, controls bound to GSettings keys, with `writes-gnome-key` flags for keys whose originals must be saved). prefs.js renders it with libadwaita. The installer can later render the same list in its Svelte look, when it is the vehicle that installed Kiwi (§4.5).
- Both write through GSettings, and Kiwi stores the originals of GNOME keys it changes (`button-layout`, `color-scheme`, hot corner, dock keys) in its own schema, so "Reset everything" and uninstall can restore them.
- Trigger rules:
  - run once (`onboarding-done`);
  - never in the `initial-setup` session mode;
  - never on top of GNOME's welcome dialog;
  - "Not Now" leaves Kiwi's defaults in place;
  - it can be re-run from the Logo menu → "Kiwi Setup Assistant…".

#### 4.5 Installing Kiwi itself, the Mac way
Constraints: a Shell extension is not an app. On Wayland a newly installed extension **cannot be loaded live from files**; the user must log out, unless GNOME Shell installs it itself through **`org.gnome.Shell.Extensions.InstallRemoteExtension(uuid)`**, which downloads from extensions.gnome.org, shows the Shell's own modal "Install Extension — Download and install 'Kiwi' from extensions.gnome.org?" and loads it immediately (`js/ui/extensionDownloader.js` in gnome-shell 50).

Plan, in priority order:
1. **"Get Kiwi" as a guided installer flow (the `.pkg` model).** The installer gains a built-in "Kiwi" product page (or opens a tiny `kiwi.installer` descriptor file the website offers; a custom MIME type the installer owns):
   - **Introduction** (what Kiwi does, screenshots in the installer's look);
   - **License** (GPL summary);
   - **Install:** call `InstallRemoteExtension("kiwi@kemma")` → the Shell's own confirmation → live load. No logout, no password. Check `ShellVersion` first and show "Kiwi needs GNOME 50" when it doesn't match;
   - **Set Up:** the onboarding steps (§4.4 option B rendering);
   - **Summary:** "Kiwi is ready", with **Open Kiwi Settings** (`OpenExtensionPrefs`) and **Done**.
   This is the closest Linux equivalent of Installer.app, and it uses only public Shell D-Bus methods.
2. **Copr RPM** (`gnome-shell-extension-kiwi`, a system extension under `/usr/share/gnome-shell/extensions/kiwi@kemma`) for users who want dnf/GNOME Software updates. Double-clicking that RPM in the installer would show the DMG window with "Kiwi → Extensions" and the normal polkit flow, but the Done view must say "Log out and back in to finish" (Wayland), then enable through `EnableExtension` after relogin. It is secondary because of the logout.
3. **Offline zip:** the installer recognises a GNOME extension zip, a *new* inspector that reads `metadata.json` from the zip without executing anything: uuid, name, shell-version, compatibility. It installs to `~/.local/share/gnome-shell/extensions/<uuid>`, then shows "Log out to finish". The extension zip is `application/zip`, which must not be claimed as a default, so this path works only through "Open a Package…" or drop.
- **Updates:** EGO installs are updated by the Shell (`CheckForUpdates`; applied at next login). Copr installs are updated by dnf through GNOME Software.
- **Uninstall Kiwi:** the installer's library lists Kiwi as a special tile; "Remove" calls `UninstallExtension("kiwi@kemma")`. Before that, Kiwi must restore saved GNOME keys. Because `disable()` also runs on lock, the restore can't live in `disable()`. Add a Kiwi D-Bus-free path: the installer sets a Kiwi GSettings key `pending-uninstall=true`, Kiwi's settings watcher restores the originals and acknowledges, then the installer uninstalls. If Kiwi isn't running, the installer restores the saved originals itself from Kiwi's schema.
- `make install` stays for developers. It is not the user path.

### 5. Concrete next steps

**Installer repo (`app-installer`)**
1. Fix the doc drift: README RPM status; Reduced Motion is GNOME 50; unify the desktop id (`io.github.blueyzx64.Installer.desktop` in `tauri.conf.json` bundle config, metainfo `launchable`, Copr spec), and add a CI check that the built RPM contains exactly that id.
2. Run a fresh **Fedora 44** Workstation spike (R1/R3): is PackageKit installed? Does dnf5daemon local-file install trigger GNOME's polkit dialog? Make dnf5daemon primary on Fedora if so; adjust `Requires:`; update ADR-0004 (still "Proposed").
3. Add the session D-Bus API `io.github.blueyzx64.Installer1` (§4.1) plus a D-Bus service file, plus LauncherEntry progress. New ADR: "External API for the desktop shell".
4. F-16 trust step: RPM signature known or unknown, scriptlets present, repo file in payload, AppImage unsigned. All read from headers or SquashFS, never executed. Add copy to COPY.md.
5. Done view: "Move the downloaded file to the Trash" (only for files under XDG Downloads).
6. Flatpak support (`.flatpakref`, `.flatpakrepo`, `.flatpak`) through libflatpak (`flatpak` crate bindings or `org.freedesktop.Flatpak.SystemHelper`), or hand off to GNOME Software via `gnome-software --local-filename` as a first step.
7. AppImage update check from the `.upd-info` ELF section (zsync), as a "Update available" badge in the library.
8. Leftovers cleanup option on uninstall (opt-in, to the Trash, exact id matches only).
9. "Kiwi" product flow (§4.5) behind a feature flag, using `org.gnome.Shell.Extensions`.

**Kiwi repo (`kiwi-is-not-apple`)**
1. Overhaul P1 (dock): the Downloads stack moves into the dock; add package badges, partial downloads and the completion bounce (§4.2).
2. P1: the onboarding welcome flow in prefs (§4.4 A), with saved-originals keys for every GNOME key Kiwi writes and a restore path that never runs on lock.
3. P2: a LauncherEntry consumer in the dock (progress, count badges). Logo menu items "App Store…" (GNOME Software) and "Software Update…" (Updates page via the `set-mode` action), with a pending-update dot read from prepared offline-update markers.
4. P2: Launchpad jiggle mode with the ⓧ rules (§4.3), and dock-Trash drag-to-uninstall, through `Installer1.Uninstall` and GNOME Software's `uninstall` action. Async, with timeouts, degrading when absent.
5. P2: a Login Items prefs page (autostart files with `X-Kiwi-Created`, the permission store `background` table) and an opt-in "Background Items Added" notification.
6. P5 (notch v3): an "Installing…" live activity from LauncherEntry progress.
7. P7 (installer phase): end-to-end tests in the GNOME 50 test environment. Install the installer RPM, set it as default, double-click an AppImage from the stack, see the dock progress, Launchpad shows the new app, jiggle-delete it, verify it is in the Trash and the ledger is empty. Then run the 20 enable/disable cycles with the installer running.
8. P3: the Privacy-by-category page and the migration profile export/import (shared JSON format with the installer).
9. Add rules to the Kiwi decoration features (rounded corners, window controls, Genie) for the installer's undecorated window (R5).

---

## Summary

| Feature | macOS (introduced / last change) | GNOME 50 mechanism | Kiwi status | Recommendation | Effort |
|---|---|---|---|---|---|
| DMG drag-to-Applications | OS X era; Internet-enabled DMG dropped 10.15 | Owner's installer (AppImage → `~/Applications`, RPM via polkit) + default handler | none (installer has it) | Port P1 via installer | S |
| Translocation + quarantine | 10.5 / 10.12 | Missing `+x` hand-off; inspect without executing | none | Skip | S |
| Installer.app / .pkg | 10.0; notarized since 10.15 | RPM via PackageKit/dnf5daemon; a wizard only for Kiwi itself | none | Later P3 (Kiwi wizard) | M |
| Gatekeeper / notarization / Open Anyway | 10.8; 10.15; Sequoia removed Control-click | Flathub safety ratings; RPM GPG + untrusted polkit; installer trust step F-16 | none | Port P2 (installer) | M |
| Mac App Store + app updates | 10.6.6; 15.1 external disk | GNOME Software (dnf5 plugin on F44), Flatpak auto-updates; Kiwi Logo menu, LauncherEntry badges, Launchpad progress | partial (planned menu item) | Port P2 | M |
| Software Update (+ BSI in Tahoe) | 10.14; RSR 13; BSI 26 | GNOME Software offline updates, upgrade banner, fwupd; Kiwi menu dot + "Update and Restart" | none | Port P2 | S |
| Uninstall by drag to Trash, leftovers | 10.0; App Management 13 | GIO Trash (AppImage), RPM remove, `flatpak uninstall --delete-data`; dock Trash → owner's uninstall | none | Port P2 | M |
| Launchpad jiggle delete | 10.7; **removed in Tahoe 26** | Kiwi app-grid jiggle; ⓧ → installer `Uninstall` or GNOME Software `uninstall` action | partial (toggle only) | Port P2 | M |
| Downloads stack | 10.5 | Kiwi dock stack (`downloadsStack.js`), package badges, partial downloads | have (DtD) → moving to Kiwi dock | Port P1 | S |
| Login Items / Allow in the Background | 13 Ventura; 15 "Login Items & Extensions" | Background portal, Settings → Apps → Run in Background, Quick Settings Background Apps, XDG autostart; Kiwi Open at Login + prefs page + notification | none | Port P2 | M |
| App Sandbox + TCC | 10.14/10.15; 15 monthly screen recording | Portals + permission store, Settings → Apps; Kiwi per-category page | none | Later P3 | M |
| Setup Assistant | 10.0 → Tahoe | gnome-initial-setup + GNOME Tour; Kiwi welcome flow in prefs (installer skin later) | none | Port P1 | M |
| Migration Assistant | 10.3 | GNOME Backups; Kiwi/installer migration profile | none | Later P3 | L |
| Owner's installer ↔ Kiwi | — | D-Bus `Installer1` API, LauncherEntry, default handler, `InstallRemoteExtension` for Kiwi | none | P7 (with P1/P2 hooks) | M |

## Sources

**Apple**
- [Gatekeeper and runtime protection in macOS (Apple Platform Security)](https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web)
- [Protecting against malware in macOS (notarization, revocation, XProtect)](https://support.apple.com/guide/security/protecting-against-malware-sec469d47bd8/web)
- [Protecting app access to user data (TCC)](https://support.apple.com/guide/security/protecting-app-access-to-user-data-secddd1d86a6/web)
- [App code signing process in macOS](https://support.apple.com/guide/security/app-code-signing-process-sec3ad8e6e53/web)
- [Safely open apps on your Mac (Gatekeeper dialogs, Open Anyway)](https://support.apple.com/en-us/102445)
- [Notarization (Apple Platform Support)](https://support.apple.com/guide/platform-support/notarization-sup1bb3ceba8/web)
- [Change Login Items & Extensions settings on Mac](https://support.apple.com/guide/mac-help/change-login-items-settings-mtusr003/mac)
- [Install and uninstall apps from the internet or a disc on Mac](https://support.apple.com/guide/mac-help/install-and-uninstall-other-apps-mh35835/mac)
- [Get macOS updates (Software Update)](https://support.apple.com/guide/mac-help/get-macos-updates-mchlpx1065/mac)
- [Update macOS and apps (App Store guide)](https://support.apple.com/guide/app-store/fir9b01adda3)
- [Transfer to a new Mac with Migration Assistant](https://support.apple.com/en-us/102613)
- [Control access to files and folders on Mac](https://support.apple.com/guide/mac-help/control-access-to-your-files-and-folders-mchld5a35146/mac)
- [Set up your MacBook Pro (Setup Assistant steps)](https://support.apple.com/guide/macbook-pro/apd831707cb3/2021/mac/12)
- [Organize files in stacks on Mac](https://support.apple.com/guide/mac-help/organize-files-in-stacks-mh35846/10.15/mac)
- [Managed login items (Apple deployment)](https://support.apple.com/guide/deployment/depdca572563/web)
- [SMAppService (developer documentation)](https://developer.apple.com/documentation/servicemanagement/smappservice.md)
- [DTS on Login Items vs Allow in the Background](https://developer.apple.com/forums/thread/719862)
- [Developer forums: Gatekeeper cannot verify app from unmounted DMG offline](https://developer.apple.com/forums/thread/129146)
- [Developer forums: New "App Management" privacy setting in Ventura](https://developer.apple.com/forums/thread/715220)

**Deep reviews and reporting on macOS**
- [Eclectic Light: What causes App Translocation?](https://eclecticlight.co/2023/05/09/what-causes-app-translocation)
- [Eclectic Light: Lost in Translocation](https://eclecticlight.co/2024/05/14/lost-in-translocation/)
- [Objective-See: 'Untranslocating' an App](https://objective-see.org/blog/blog_0x15.html)
- [TidBITS: Move downloaded Mac apps before initial launch](https://tidbits.com/2022/09/06/move-downloaded-mac-apps-before-initial-launch/)
- [Keyboard Maestro wiki: Translocation Problem](https://wiki.keyboardmaestro.com:8443/assistance/Translocation_Problem)
- [AppleInsider: Apple removes Control-click Gatekeeper bypass in Sequoia](https://appleinsider.com/articles/24/08/06/apple-removes-control-click-option-for-skipping-gatekeeper-in-macos-sequoia)
- [AppleInsider: What's changed in runtime protection for macOS Sequoia](https://appleinsider.com/inside/macos-sequoia/tips/whats-changed-in-runtime-protection-for-macos-sequoia)
- [Michael Tsai: Ventura App Management](https://mjtsai.com/blog/2022/11/07/ventura-app-management/)
- [Macworld: Security hole in Mac App Management](https://www.macworld.com/article/2037255/researcher-reveals-security-hole-in-mac-app-management.html)
- [theevilbit: SMAppService internals](https://theevilbit.github.io/posts/smappservice)
- [Background Task Management (backgroundtaskmanagementd) notes](https://oliviagallucci.github.io/og-apple-security/macOS-internals/btm-backgroundtaskmanagementd/1.%20Background%20Task%20Management%20-%20backgroundtaskmanagementd.html)
- [DSSW: macOS Login Items guide](https://www.dssw.co.uk/powermanager/guide/finding-and-fixing/macos-login-items/)
- [9to5Mac: Sequoia screen recording prompt monthly](https://9to5mac.com/2024/08/14/macos-sequoia-screen-recording-prompt-monthly/)
- [TidBITS: Apple reduces Sequoia permission requests](https://tidbits.com/2024/08/19/apple-reduces-excessive-sequoia-permission-requests-shifts-to-monthly)
- [MacRumors: Install Mac apps on external storage in Sequoia](https://www.macrumors.com/how-to/install-mac-apps-external-storage-macos)
- [MacRumors: Background Security Improvement for Tahoe 26.3.1](https://www.macrumors.com/2026/03/17/security-update-ios-26-3-1/)
- [MacTech: Apple testing Background Security Improvements](https://www.mactech.com/2026/01/06/apple-testing-background-security-improvement-feature-on-iphones-ipads-macs)
- [9to5Mac: Launchpad alternatives in macOS Tahoe 26](https://9to5mac.com/2025/09/15/launchpad-macos-tahoe-26-alternative/)
- [MacRumors forum: App Store app deletion in macOS 26/27 vs the user guide](https://forums.macrumors.com/threads/mac-app-store-apps-deletion-process-broken-in-macos-26-27-mac-user-guide-contradicts-reality.2484693/)
- [iMore: How to use Launchpad (jiggle mode)](https://imore.com/how-use-launchpad-mac)
- [Mr. Macintosh: macOS 27 Golden Gate available](https://mrmacintosh.com/macos-27-golden-gate-is-now-available-for-all-users/)
- [Scripting OS X: Inspecting packages](https://scriptingosx.com/?p=2394)
- [Eclectic Light: What was installed? (receipts)](https://eclecticlight.co/2015/09/25/what-was-installed/)
- [create-dmg (window, background, app-drop-link)](https://github.com/flipperdevices/create-dmg)
- [install4j: Styling of DMGs (.DS_Store)](https://resources.ej-technologies.com/install4j/help/doc/concepts/dmgStyling.html)
- [DropDMG manual: Internet-enabled images](https://c-command.com/dropdmg/help/internet-enabled)
- [Wikipedia: Stacks (Mac OS)](https://en.wikipedia.org/wiki/Stacks_(Mac_OS))

**Linux, GNOME, Flatpak, Fedora**
- [XDG Desktop Portal: Background portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Background.html)
- [XDG Desktop Portal: API reference](https://flatpak.github.io/xdg-desktop-portal/docs/api-reference.html)
- [Flatpak: Sandbox permissions](https://docs.flatpak.org/en/latest/sandbox-permissions.html)
- [flatpak-uninstall(1)](https://man.archlinux.org/man/flatpak-uninstall.1.en)
- [XDG Autostart specification](https://specifications.freedesktop.org/autostart-spec/latest/)
- [GNOME 50 release notes (Reduced Motion, Settings)](https://release.gnome.org/50/)
- [GNOME 49 release notes (Software performance)](https://release.gnome.org/49/)
- [gnome-control-center: Apps panel source (Run in Background)](https://gitlab.gnome.org/GNOME/gnome-control-center/-/tree/gnome-50/panels/applications)
- [gnome-control-center issue #797: Run in background / Start at login](https://gitlab.gnome.org/GNOME/gnome-control-center/issues/797)
- [gnome-software: gs-application.c (command-line options and actions)](https://gitlab.gnome.org/GNOME/gnome-software/-/blob/main/src/gs-application.c)
- [gnome-shell: org.gnome.Shell.Extensions D-Bus interface](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-50/data/dbus-interfaces/org.gnome.Shell.Extensions.xml)
- [gnome-shell: extensionDownloader.js (InstallRemoteExtension dialog)](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-50/js/ui/extensionDownloader.js)
- [GNOME Discourse: Enabling local Shell extensions (logout needed)](https://discourse.gnome.org/t/enabling-local-shell-extensions/21199)
- [GNOME Discourse: Enable extensions without session restart](https://discourse.gnome.org/t/enable-gnome-extensions-without-session-restart/7936)
- [gnome-initial-setup pages (gnome-50 branch)](https://gitlab.gnome.org/GNOME/gnome-initial-setup/-/tree/gnome-50/gnome-initial-setup/pages)
- [GNOME Tour (Apps for GNOME)](https://apps.gnome.org/Tour/)
- [OMG! Linux: GNOME 44 Background Apps UI](https://www.omglinux.com/gnome-shell-background-apps-ui/)
- [Red Hat Bugzilla 2457805: Background Apps missing in GNOME 50](https://bugzilla.redhat.com/show_bug.cgi?id=2457805)
- [Fedora Change: PackageKit-DNF5 (F44)](https://fedoraproject.org/wiki/Changes/PackageKit-DNF5)
- [Fedora Discussion: GNOME Software's integration with PackageKit and DNF (F44)](https://discussion.fedoraproject.org/t/about-gnome-softwares-integration-with-packagekit-and-dnf/191528)
- [Fedora gnome-software.spec (f44: packagekit off, dnf5 on)](https://src.fedoraproject.org/rpms/gnome-software/blob/f44/f/gnome-software.spec)
- [Linuxiac: PackageKit 2.0 is coming with a complete API break](https://linuxiac.com/packagekit-2-0-is-coming-with-a-complete-api-break-after-more-than-a-decade/)
- [hughsie: GNOME Software and automatic updates](https://blogs.gnome.org/hughsie/2018/08/08/gnome-software-and-automatic-updates/)
- [Fedora Discussion: automatic offline updates](https://discussion.fedoraproject.org/t/how-to-configure-automatic-offline-updates-with-fedora/106574)
- [Chromium: stop writing origin/referrer xattrs on Linux](https://chromium.googlesource.com/chromium/src/+/a9b4fb70b4318b220deee0da7b1693d16b8ed071)
- [Mozilla bug 665531: set xdg origin xattrs on downloads](https://bugzilla.mozilla.org/show_bug.cgi?id=665531)
- [GNOME Discourse: XDG extended attribute spec support](https://discourse.gnome.org/t/feat-xdg-extended-attribute-spec-support/16892)
- [Gear Lever (AppImage manager)](https://github.com/mijorus/gearlever)
- [appimage-builder: AppImage updates (zsync, gh-releases-zsync)](https://appimage-builder.readthedocs.io/en/latest/advanced/updates.html)
- [appimageupdate (Rust)](https://docs.rs/crate/appimageupdate/latest)
- [openSUSE bug: .flatpakref via gnome-software --local-filename](https://lists.opensuse.org/archives/list/bugs@lists.opensuse.org/thread/VNDTTHEEAZN4F2D5DJAQBMCE4IWO465Q)

## Orchestrator verification (2026-10-27)
Checked against the Fedora 44 repositories (`dnf repoquery --requires gnome-software` in a Fedora 44 root). GNOME Software on F44 requires `dnf5daemon-server` (>= 5.4.2), `dnf5daemon-server-polkit` and `libdnf5-plugin-appstream`, not PackageKit. The installer should treat **dnf5daemon as its primary RPM backend on Fedora 44**, and PackageKit only as a fallback. Whether a fresh Workstation install still pulls in PackageKit through another package remains unverified.
