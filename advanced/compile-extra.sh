#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later

# compile-extra.sh - Compile the Kiwi titlebuttons hover module from source

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Kiwi - Titlebuttons Hover Module Compiler${NC}"
echo "=========================================="

[[ -f titlebuttons_hover.c ]] || { echo -e "${RED}Error: titlebuttons_hover.c not found${NC}" >&2; exit 1; }

CC_BIN="${CC:-cc}"
if ! command -v "$CC_BIN" &> /dev/null; then
    echo -e "${RED}Error: C compiler '$CC_BIN' not found${NC}" >&2
    echo "  Ubuntu/Debian: sudo apt install gcc" >&2
    echo "  Fedora: sudo dnf install gcc" >&2
    echo "  Arch: sudo pacman -S gcc" >&2
    exit 1
fi

if ! command -v pkg-config &> /dev/null; then
    echo -e "${RED}Error: pkg-config not found${NC}" >&2
    echo "  Ubuntu/Debian: sudo apt install pkg-config" >&2
    echo "  Fedora: sudo dnf install pkg-config" >&2
    echo "  Arch: sudo pacman -S pkg-config" >&2
    exit 1
fi

if ! pkg-config --exists gtk+-3.0; then
    echo -e "${RED}Error: GTK3 development files not found${NC}" >&2
    echo "  Ubuntu/Debian: sudo apt install libgtk-3-dev" >&2
    echo "  Fedora: sudo dnf install gtk3-devel" >&2
    echo "  Arch: sudo pacman -S gtk3" >&2
    exit 1
fi

echo "Compiling titlebuttons hover module from source..."
# shellcheck disable=SC2046,SC2086
"$CC_BIN" -shared -fPIC -fvisibility=hidden -O2 -g -Wall -Wextra ${CFLAGS:-} \
    -o libtitlebuttons_hover.so titlebuttons_hover.c \
    $(pkg-config --cflags --libs gtk+-3.0) -Wl,--as-needed ${LDFLAGS:-}

# Marks this exact binary as built on this machine. The marker holds its SHA-256, so the
# installer trusts it only while the .so is unchanged (a later git pull that brings a new
# prebuilt file invalidates it).
sha256sum libtitlebuttons_hover.so | cut -d' ' -f1 > .built-locally

echo -e "${GREEN}Compilation successful.${NC}"
echo "Run './install-extra.sh' to install it."
