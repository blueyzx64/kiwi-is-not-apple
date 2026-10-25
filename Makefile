# Developer tasks for Kiwi (is not Apple). Needs: gnome-extensions, gettext, eslint, gjs.
UUID    := kiwi@kemma
DESTDIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DISTDIR := dist
POT     := po/$(UUID).pot
# Optional sources are packed only when they exist (gnome-extensions pack fails on a missing one).
EXTRA   := icons apps css $(wildcard lib coordinators features.js)
EXTRA_FLAGS := $(addprefix --extra-source=,$(EXTRA))

.PHONY: all pack pot install uninstall test lint schema-check check clean

all: check

# Zip lands in $(DISTDIR)/$(UUID).shell-extension.zip
pack:
	@mkdir -p $(DISTDIR)
	gnome-extensions pack --force $(EXTRA_FLAGS) --podir=po -o $(DISTDIR) .

# Regenerate the translation template from po/POTFILES.
pot:
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=N_ \
		--files-from=po/POTFILES --output=$(POT) --package-name=$(UUID)

# Install the packed zip for the current user (enable it afterwards).
install: pack
	gnome-extensions install --force $(DISTDIR)/$(UUID).shell-extension.zip

uninstall:
	gnome-extensions uninstall $(UUID)

test:
	bash tests/run.sh

lint:
	eslint .

# Strict compile into a throwaway dir; fails on schema errors and warnings.
schema-check:
	@d=$$(mktemp -d) && glib-compile-schemas --strict --dry-run schemas && \
		glib-compile-schemas --strict --targetdir="$$d" schemas; r=$$?; rm -rf "$$d"; exit $$r

check: lint schema-check test

clean:
	rm -rf $(DISTDIR)
