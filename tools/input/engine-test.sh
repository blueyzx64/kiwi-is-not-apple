#!/bin/bash
# Kiwi input engine test on a real, private ibus-daemon: no system install, nothing of the
# user's touched (temp HOME/XDG dirs, memory settings backend, a private session bus).
#   tools/input/engine-test.sh
# Needs ibus-daemon, gjs, glib-compile-schemas and dbus-run-session (on dbus-broker-only hosts,
# tools/smoke/dbus-run-session-broker.py is used). Exit 0 when every check passes.
set -u
SRC=$(cd "$(dirname "$0")/../.." && pwd)
for c in ibus-daemon gjs glib-compile-schemas; do
  command -v "$c" >/dev/null || { echo "missing: $c" >&2; exit 2; }
done
RUNNER=dbus-run-session
command -v dbus-run-session >/dev/null || RUNNER="python3 $SRC/tools/smoke/dbus-run-session-broker.py"

# Short path: ibus puts its socket under XDG_CACHE_HOME (unix socket paths are limited)
T=$(mktemp -d /tmp/kiwi-input.XXXXXX)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/component" "$T/schemas" "$T/cache" "$T/config" "$T/data"
glib-compile-schemas --targetdir="$T/schemas" "$SRC/schemas" || exit 2
# The launcher ibus-daemon runs (the installed one is kiwi-input-engine.sh.in); it logs to $T
printf '#!/bin/sh\nexec gjs -m %s/helpers/kiwi-input/kiwi-input-engine.js "$@" --schemadir %s/schemas 2>>%s/engine.log\n' \
  "$SRC" "$T" "$T" >"$T/kiwi-input-engine"
chmod +x "$T/kiwi-input-engine"
sed -e "s|@LIBEXECDIR@|$T|g" \
    -e "s|@VERSION@|test|" "$SRC/helpers/kiwi-input/kiwi-input.xml.in" >"$T/component/kiwi-input.xml"

cat >"$T/inner.sh" <<'IN'
export HOME=$T XDG_CACHE_HOME=$T/cache XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data
export GSETTINGS_BACKEND=memory IBUS_ADDRESS_FILE=$T/ibus-address
IBUS_COMPONENT_PATH=$T/component ibus-daemon --panel=disable --xim=false --config=disable \
  --cache=refresh >"$T/daemon.log" 2>&1 &
DP=$!
for _ in $(seq 1 50); do [ -s "$T/ibus-address" ] && break; sleep 0.1; done
IBUS_ADDRESS=$(sed -n 's/^IBUS_ADDRESS=//p' "$T/ibus-address")
export IBUS_ADDRESS
gjs -m "$SRC/tools/input/engine-test.js"
RC=$?
kill $DP 2>/dev/null
exit $RC
IN
export T SRC
$RUNNER -- bash "$T/inner.sh" 2> >(grep -v -E 'Eavesdropping|portal is not running' >&2)
RC=$?
[ $RC -ne 0 ] && { echo "-- daemon log"; tail -20 "$T/daemon.log"; echo "-- engine log"; tail -20 "$T/engine.log"; }
exit $RC
