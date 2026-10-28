# Developer tasks for Kiwi (is not Apple). Needs: gnome-extensions, gettext, eslint, gjs.
UUID    := kiwi@kemma
DESTDIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DISTDIR := dist
POT     := translating/kiwi.pot
# Every source folder the zip needs. Keep in step with .github/workflows/pack-release.yml.
EXTRA   := icons lib core features prefs features.js
EXTRA_FLAGS := $(addprefix --extra-source=,$(EXTRA))
# Shell styles: stylesheet.css is built from these (and committed)
CSS_SRC := styles/base.css $(sort $(wildcard features/*/style.css))

.PHONY: all css css-check pack pack-check pot install uninstall test lint schema-check check clean smoke helper-rpm helper-install \
	input-install input-uninstall input-rpm input-test

all: check

# stylesheet.css = styles/base.css + features/*/style.css
css: stylesheet.css
stylesheet.css: $(CSS_SRC) tools/build-css.sh
	tools/build-css.sh

css-check:
	tools/build-css.sh --check

# Zip lands in $(DISTDIR)/$(UUID).shell-extension.zip
pack: css
	@mkdir -p $(DISTDIR)
	gnome-extensions pack --force $(EXTRA_FLAGS) --podir=po -o $(DISTDIR) .

# The zip holds what the extension loads, and nothing of the features v3 dropped
pack-check: pack
	tools/check-pack.sh $(DISTDIR)/$(UUID).shell-extension.zip

# Regenerate the translation template (translating/kiwi.pot) and po/POTFILES from every
# source file that has translatable strings. Sources are found recursively.
pot:
	@srcs=$$(ls extension.js prefs.js features.js 2>/dev/null; find lib core features prefs -name '*.js' | sort) && \
	xgettext --from-code=UTF-8 --language=JavaScript \
		-k_ -kN_ -kgettext -kgettextFunc -k_gettext --add-comments=TRANSLATORS \
		--package-name="Kiwi is not Apple" --package-version=3.0.0 \
		--copyright-holder="Arnis Kemlers" \
		--msgid-bugs-address=https://github.com/kem-a/kiwi-kemma/issues \
		-o $(POT) $$srcs && \
	grep '^\#: ' $(POT) | sed 's/^\#: //' | tr ' ' '\n' | sed 's/:.*//' | sort -u > po/POTFILES

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

check: lint schema-check css-check test

# The shelf drag-out helper is its own package (not in the extension zip): make helper-rpm
# builds dist/helper/RPMS/noarch/kiwi-shelf-helper-*.rpm (needs rpmbuild)
HELPER_DIR  := helpers/kiwi-shelf-helper
HELPER_NAME := kiwi-shelf-helper
HELPER_VER  := $(shell sed -n 's/^Version:[[:space:]]*//p' $(HELPER_DIR)/$(HELPER_NAME).spec)
HELPER_TOP  := $(CURDIR)/$(DISTDIR)/helper

helper-rpm:
	rm -rf $(HELPER_TOP)
	mkdir -p $(HELPER_TOP)/SOURCES $(HELPER_TOP)/stage/$(HELPER_NAME)-$(HELPER_VER)
	cp $(HELPER_DIR)/kiwi-shelf-helper.js $(HELPER_DIR)/org.kiwi.ShelfHelper.desktop \
		$(HELPER_TOP)/stage/$(HELPER_NAME)-$(HELPER_VER)/
	tar -C $(HELPER_TOP)/stage -czf $(HELPER_TOP)/SOURCES/$(HELPER_NAME)-$(HELPER_VER).tar.gz $(HELPER_NAME)-$(HELPER_VER)
	rpmbuild -bb --define "_topdir $(HELPER_TOP)" --define "dist %{nil}" $(HELPER_DIR)/$(HELPER_NAME).spec
	@ls $(HELPER_TOP)/RPMS/*/*.rpm

# Install the same files for the current user (no root): ~/.local/bin and ~/.local/share/applications
helper-install:
	install -Dm0755 $(HELPER_DIR)/kiwi-shelf-helper.js $(HOME)/.local/bin/kiwi-shelf-helper
	install -Dm0644 $(HELPER_DIR)/org.kiwi.ShelfHelper.desktop $(HOME)/.local/share/applications/org.kiwi.ShelfHelper.desktop

# The Kiwi input engine (press and hold for accents, Text Replacements) is its own package too
# (not in the extension zip). ibus-daemon reads components only from its own data dir
# (/usr/share/ibus/component), so this is a system install; there is no per-user one.
#   sudo make input-install     /usr/share/kiwi-input, /usr/libexec/kiwi-input-engine and the
#                               IBus component (INPUT_ROOT=dir stages it elsewhere, for packaging)
#   sudo make input-uninstall   removes exactly those files
#   make input-rpm              dist/input/RPMS/noarch/kiwi-input-*.rpm (needs rpmbuild)
#   make input-test             the engine on a private ibus-daemon (tools/input/engine-test.sh)
INPUT_DIR   := helpers/kiwi-input
INPUT_NAME  := kiwi-input
INPUT_VER   := $(shell sed -n 's/^Version:[[:space:]]*//p' $(INPUT_DIR)/$(INPUT_NAME).spec)
INPUT_TOP   := $(CURDIR)/$(DISTDIR)/input
INPUT_JS    := kiwi-input-engine.js accentsModel.js enginesModel.js holdModel.js replacementsModel.js
INPUT_SRC   := $(addprefix $(INPUT_DIR)/,$(INPUT_JS) kiwi-input-engine.sh.in kiwi-input.xml.in $(INPUT_NAME).spec)
INPUT_ROOT  ?=

input-install:
	install -d $(INPUT_ROOT)/usr/share/kiwi-input $(INPUT_ROOT)/usr/libexec $(INPUT_ROOT)/usr/share/ibus/component
	install -m0644 $(addprefix $(INPUT_DIR)/,$(INPUT_JS)) $(INPUT_ROOT)/usr/share/kiwi-input/
	sed 's|@DATADIR@|/usr/share|' $(INPUT_DIR)/kiwi-input-engine.sh.in >$(INPUT_ROOT)/usr/libexec/kiwi-input-engine
	chmod 0755 $(INPUT_ROOT)/usr/libexec/kiwi-input-engine
	sed -e 's|@LIBEXECDIR@|/usr/libexec|g' -e 's|@VERSION@|$(INPUT_VER)|' $(INPUT_DIR)/kiwi-input.xml.in \
		>$(INPUT_ROOT)/usr/share/ibus/component/kiwi-input.xml
	@echo "Installed. Log out and back in (or run 'ibus restart' as yourself), then add a '(Kiwi)' input source."

input-uninstall:
	rm -f $(addprefix $(INPUT_ROOT)/usr/share/kiwi-input/,$(INPUT_JS))
	-rmdir $(INPUT_ROOT)/usr/share/kiwi-input
	rm -f $(INPUT_ROOT)/usr/libexec/kiwi-input-engine $(INPUT_ROOT)/usr/share/ibus/component/kiwi-input.xml

input-rpm:
	rm -rf $(INPUT_TOP)
	mkdir -p $(INPUT_TOP)/SOURCES $(INPUT_TOP)/stage/$(INPUT_NAME)-$(INPUT_VER)
	cp $(INPUT_SRC) $(INPUT_TOP)/stage/$(INPUT_NAME)-$(INPUT_VER)/
	tar -C $(INPUT_TOP)/stage -czf $(INPUT_TOP)/SOURCES/$(INPUT_NAME)-$(INPUT_VER).tar.gz $(INPUT_NAME)-$(INPUT_VER)
	rpmbuild -bb --define "_topdir $(INPUT_TOP)" --define "dist %{nil}" $(INPUT_DIR)/$(INPUT_NAME).spec
	@ls $(INPUT_TOP)/RPMS/*/*.rpm

input-test:
	tools/input/engine-test.sh

clean:
	rm -rf $(DISTDIR)

# Headless Shell smoke test (needs gnome-shell + dbus; not part of CI). make smoke TOGGLES=20
smoke:
	tools/smoke/run-headless.sh $(TOGGLES)
