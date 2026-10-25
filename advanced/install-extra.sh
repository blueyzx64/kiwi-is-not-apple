#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later

# install-extra.sh - Install the Kiwi titlebuttons hover module for the current user

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MODULE=libtitlebuttons_hover.so
LIB_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/kiwi/gtk3-modules"
ENV_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/environment.d"
CONF_FILE="$ENV_DIR/10-gtk3-titlebuttons.conf"
TARGET="$LIB_DIR/$MODULE"

echo -e "${GREEN}Kiwi - Titlebuttons Hover Module Installer${NC}"
echo "==========================================="

if [[ ! -f "$MODULE" ]]; then
    echo -e "${RED}Error: $MODULE not found. Build it first with ./compile-extra.sh${NC}" >&2
    exit 1
fi

# The binary shipped in the repository is x86_64 only and has a published checksum.
# A module built here by compile-extra.sh is trusted as is.
if [[ ! -f .built-locally ]]; then
    if [[ "$(uname -m)" != x86_64 ]]; then
        echo -e "${RED}The prebuilt module is x86_64 only. Run ./compile-extra.sh${NC}" >&2
        exit 1
    fi
    if ! sha256sum --check --status "$MODULE.sha256"; then
        echo -e "${RED}Checksum mismatch for $MODULE. Not installing.${NC}" >&2
        echo "Rebuild from source with ./compile-extra.sh" >&2
        exit 1
    fi
    echo -e "${GREEN}✓ Checksum matches $MODULE.sha256${NC}"
fi

mkdir -p "$LIB_DIR" "$ENV_DIR"

# install(1) writes a new file and renames it over the old one. Running GTK3 apps keep the
# old mapping; copying over the same inode would change code they are executing.
install -m 0644 "$MODULE" "$TARGET"
echo -e "${GREEN}✓ Module installed to $TARGET${NC}"

# GTK3_MODULES (not GTK_MODULES: GTK 2 reads that one too). Append to what the user's other
# environment.d files already set, via environment.d variable expansion.
tmp="$(mktemp "$CONF_FILE.XXXXXX")"
printf '# Kiwi GTK3 titlebuttons hover module\nGTK3_MODULES=${GTK3_MODULES:+$GTK3_MODULES:}%s\n' "$TARGET" > "$tmp"
mv -f "$tmp" "$CONF_FILE"
echo -e "${GREEN}✓ Wrote $CONF_FILE${NC}"

# Older versions installed the library into environment.d itself
rm -f "$ENV_DIR/$MODULE"

echo ""
echo -e "${YELLOW}Log out and back in to apply.${NC}"
echo "Check afterwards with: systemctl --user show-environment | grep GTK3_MODULES"
echo "The module is per user. It only affects GTK3 apps (not GTK4, Flatpak or non-GTK apps)."
