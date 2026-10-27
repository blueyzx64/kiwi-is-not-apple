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

.PHONY: all css css-check pack pack-check pot install uninstall test lint schema-check check clean smoke

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

clean:
	rm -rf $(DISTDIR)

# Headless Shell smoke test (needs gnome-shell + dbus; not part of CI). make smoke TOGGLES=20
smoke:
	tools/smoke/run-headless.sh $(TOGGLES)
