#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later

# uninstall-extra.sh - Uninstall the Kiwi titlebuttons hover module

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

MODULE=libtitlebuttons_hover.so
LIB_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/kiwi/gtk3-modules"
ENV_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/environment.d"
CONF_FILE="$ENV_DIR/10-gtk3-titlebuttons.conf"

echo -e "${YELLOW}Kiwi - Titlebuttons Hover Module Uninstaller${NC}"

removed=0
# Current layout, then the layout of older versions (library inside environment.d)
for f in "$LIB_DIR/$MODULE" "$ENV_DIR/$MODULE" "$CONF_FILE"; do
    if [[ -e "$f" ]]; then
        rm -f "$f"
        echo -e "${GREEN}✓ Removed $f${NC}"
        removed=1
    fi
done
rmdir "$LIB_DIR" 2>/dev/null || true
rmdir "$(dirname "$LIB_DIR")" 2>/dev/null || true

if [[ $removed -eq 0 ]]; then
    echo "The module is not installed."
    exit 0
fi

echo ""
echo -e "${YELLOW}Log out and back in for the change to take effect.${NC}"
echo "Kiwi keeps working without the hover effect. Reinstall any time with ./install-extra.sh"
