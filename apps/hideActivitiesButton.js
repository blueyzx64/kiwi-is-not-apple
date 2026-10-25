// SPDX-License-Identifier: GPL-3.0-or-later
// Hides the Activities button in the top panel while the feature is enabled (on by default).
//
// Since GNOME 45 the button holds the workspace indicator, so on GNOME 50 it is the pill of
// workspace dots at the top left. The panel puts each status-area button in a container (an
// St.Bin in _leftBox); hiding only the button would keep that bin's slot and spacing, so the
// whole container is hidden. Panel._updatePanel() shows every container again on a session
// mode change, so a 'notify::visible' handler keeps it hidden until disable().
// The window controls and app title are placed by PanelLayout anchors and do not depend on
// the Activities container, so they move to the very left on their own.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let _container = null;
let _wasVisible = false;
let _visibleId = 0;

export function enable() {
    if (_container)
        return;
    _container = Main.panel.statusArea.activities?.container ?? null;
    if (!_container)
        return;
    _wasVisible = _container.visible;
    _container.hide();
    _visibleId = _container.connect('notify::visible', () => {
        if (_container?.visible)
            _container.hide();
    });
}

export function disable() {
    if (!_container)
        return;
    if (_visibleId)
        _container.disconnect(_visibleId);
    _visibleId = 0;
    if (_wasVisible)
        _container.show();
    _container = null;
    _wasVisible = false;
}
