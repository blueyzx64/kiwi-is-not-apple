// SPDX-License-Identifier: GPL-3.0-or-later
// Dock: Kiwi's own dock arrives in phase 1 (overhaul plan §5.2); its options go here.

import Adw from 'gi://Adw';

import { comingSoonGroup } from '../widgets.js';

export const PAGE = { id: 'dock', icon: 'kiwi-dock-symbolic' };

export function build({ _ }) {
    const page = new Adw.PreferencesPage({ title: _('Dock'), icon_name: PAGE.icon });
    page.add(comingSoonGroup(_("Kiwi's own dock is on its way"),
        _('Pinned and running apps, a Downloads stack, magnification and the Genie effect arrive in a coming version.')));
    return page;
}
