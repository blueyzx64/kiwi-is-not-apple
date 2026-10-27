# Kiwi shelf helper: lets files be dragged out of the Kiwi notch shelf into other apps.
# Not part of the extension zip; install it next to the extension (make helper-rpm).
Name:           kiwi-shelf-helper
Version:        3.0.0
Release:        1%{?dist}
Summary:        Drag files out of the Kiwi notch shelf
License:        GPL-3.0-or-later
URL:            https://github.com/blueyzx64/kiwi-is-not-apple
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch
Requires:       gjs
Requires:       gtk4
Requires:       gnome-shell
Recommends:     gnome-shell-extension-kiwi

%description
A GNOME Shell extension cannot start a Wayland drag. While the Kiwi notch shelf is open,
the extension runs this helper, which owns one transparent window that the extension puts
exactly over the shelf's items. Pressing an item starts a real drag that carries the file
(text/uri-list), so Files, Text Editor and other apps accept the drop. The helper stops when
the shelf closes. Without it, the shelf keeps its Open and Copy buttons.

%prep
%autosetup

%install
install -Dm0755 kiwi-shelf-helper.js %{buildroot}%{_bindir}/kiwi-shelf-helper
install -Dm0644 org.kiwi.ShelfHelper.desktop %{buildroot}%{_datadir}/applications/org.kiwi.ShelfHelper.desktop

%check
desktop-file-validate %{buildroot}%{_datadir}/applications/org.kiwi.ShelfHelper.desktop || :

%files
%{_bindir}/kiwi-shelf-helper
%{_datadir}/applications/org.kiwi.ShelfHelper.desktop

%changelog
* Tue Oct 27 2026 blueyzx64 <samh74490@gmail.com> - 3.0.0-1
- First release
