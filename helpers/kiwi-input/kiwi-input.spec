# Kiwi input engine: press and hold for accents and Text Replacements, as an IBus engine.
# Not part of the extension zip; install it next to the extension (make input-rpm).
Name:           kiwi-input
Version:        3.0.0
Release:        1%{?dist}
Summary:        Press and hold for accents and Text Replacements for Kiwi
License:        GPL-3.0-or-later
URL:            https://github.com/blueyzx64/kiwi-is-not-apple
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch
Requires:       gjs
Requires:       ibus
Requires:       ibus-libs
Requires:       gnome-desktop4
Recommends:     gnome-shell-extension-kiwi

%description
A GNOME Shell extension cannot see the keys typed into apps on Wayland. This IBus engine keeps
the user's keyboard layout (one engine per XKB layout, named "<layout> (Kiwi)") and adds two
macOS typing aids: holding a letter shows its accented variants, numbered 1 to 9, and Text
Replacements turn a shortcut into its phrase. Settings come from the Kiwi extension's schema.

%prep
%autosetup

%install
install -d %{buildroot}%{_datadir}/kiwi-input %{buildroot}%{_libexecdir} %{buildroot}%{_datadir}/ibus/component
install -m0644 kiwi-input-engine.js accentsModel.js enginesModel.js holdModel.js replacementsModel.js \
    %{buildroot}%{_datadir}/kiwi-input/
sed 's|@DATADIR@|%{_datadir}|' kiwi-input-engine.sh.in >%{buildroot}%{_libexecdir}/kiwi-input-engine
chmod 0755 %{buildroot}%{_libexecdir}/kiwi-input-engine
sed -e 's|@LIBEXECDIR@|%{_libexecdir}|g' -e 's|@VERSION@|%{version}|' kiwi-input.xml.in \
    >%{buildroot}%{_datadir}/ibus/component/kiwi-input.xml

%files
%{_datadir}/kiwi-input/
%{_libexecdir}/kiwi-input-engine
%{_datadir}/ibus/component/kiwi-input.xml

%changelog
* Wed Oct 28 2026 blueyzx64 <samh74490@gmail.com> - 3.0.0-1
- First release
