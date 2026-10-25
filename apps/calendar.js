// SPDX-License-Identifier: GPL-3.0-or-later
// Repositions the calendar and customizes notification widgets in the top panel.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { NotificationRouter } from '../coordinators/notificationRouter.js';
import { CleanupRegistry } from '../lib/disposables.js';

// State holders so we can fully restore on disable
let dateMenu;
let enabled = false;
let originalParent;
let originalParentIndex;
let originalMenuBoxStyle;
let hiddenMessageList = null; // date menu message list hidden while enabled
const routerCleanup = new CleanupRegistry(); // banner position pin and the shared notification state

// Notification indicator state
let notificationIndicator = null;
let notificationIndicatorParent = null;
let indicatorInsertTimeoutId = null; // timeout id for delayed indicator insertion
let kiwiExtension = null;
let kiwiSettings = null;
let indicatorStyleSignalId = 0;

function applyIndicatorStyle(style) {
    if (!notificationIndicator) return;
    // When attached to the panel right box (Keep Notification Panel mode),
    // the indicator sits after the clock and may become the rightmost panel
    // element when window controls are hidden — add right padding so the dot
    // isn't flush against the screen edge.
    const margin = notificationIndicatorParent === Main.panel._rightBox
        ? ' margin-right: 12px;'
        : '';
    switch (style) {
        case 'accent':
            notificationIndicator.style = 'color: -st-accent-color;' + margin;
            break;
        case 'symbolic':
            notificationIndicator.style = margin || null; // let panel theme color cascade
            break;
        case 'default':
        default:
            notificationIndicator.style = 'color: red;' + margin;
            break;
    }
}

function setupNotificationIndicator() {
    if (notificationIndicator) return;
    const keep = kiwiSettings.get_boolean('keep-notification-panel');
    notificationIndicatorParent = keep
        ? Main.panel._rightBox
        : Main.panel.statusArea.quickSettings._indicators;

    const initialStyle = kiwiSettings.get_string('notification-indicator-style');

    const iconFile = kiwiExtension.dir.get_child('icons/message-indicator-symbolic.svg');
    notificationIndicator = new St.Icon({
        gicon: Gio.FileIcon.new(iconFile),
        style_class: 'notification-badge',
        visible: false,
    });
    applyIndicatorStyle(initialStyle);

    // The icon goes into a panel container we don't own; if that is torn down
    // the icon goes with it and the 5 s poll would touch a disposed object.
    notificationIndicator.connect('destroy', () => {
        notificationIndicator = null;
    });

    // Add small delay to ensure all other indicators are added first
    indicatorInsertTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        indicatorInsertTimeoutId = null; // clear reference on fire
        let insertIndex = notificationIndicatorParent.get_n_children();
        // When attached directly to the panel right box (Keep Notification
        // Panel mode), keep the indicator adjacent to the clock instead of
        // letting it land at the far right of the panel.
        if (notificationIndicatorParent === Main.panel._rightBox && dateMenu?.container) {
            const dateIdx = notificationIndicatorParent.get_children().indexOf(dateMenu.container);
            if (dateIdx >= 0)
                insertIndex = dateIdx + 1;
        }
        notificationIndicatorParent.insert_child_at_index(notificationIndicator, insertIndex);
        return GLib.SOURCE_REMOVE;
    });

    // Update style live when the setting changes
    indicatorStyleSignalId = kiwiSettings.connect('changed::notification-indicator-style', () => {
        applyIndicatorStyle(kiwiSettings.get_string('notification-indicator-style'));
    });

    // Connect to notification signals and update visibility
    connectNotificationSignals();
    updateNotificationIndicator();
}

function cleanupNotificationIndicator() {
    // Disconnect signals and clear intervals
    if (indicatorInsertTimeoutId) {
        GLib.Source.remove(indicatorInsertTimeoutId);
        indicatorInsertTimeoutId = null;
    }
    if (indicatorStyleSignalId) {
        kiwiSettings.disconnect(indicatorStyleSignalId);
    }
    indicatorStyleSignalId = 0;
    kiwiSettings = null;
    kiwiExtension = null;

    if (notificationIndicator) {
        notificationIndicator.destroy();
        notificationIndicator = null;
    }
    notificationIndicatorParent = null;
}

// The dot follows the shared notification state (sources, queued banners), so it needs no
// polling and no per-source handlers of its own.
function connectNotificationSignals() {
    NotificationRouter.connect(routerCleanup, () => updateNotificationIndicator());
}

function updateNotificationIndicator() {
    if (!notificationIndicator) return;

    const hasNotifications = checkForNotifications();
    if (hasNotifications !== notificationIndicator.visible) {
        notificationIndicator.visible = hasNotifications;
    }
}

export function enable(extension) {
    if (enabled)
        return; // Prevent double-application
    kiwiExtension = extension;
    kiwiSettings = extension.getSettings();

    dateMenu = Main.panel.statusArea.dateMenu;

    // Store original parent + index for clean restoration
    originalParent = dateMenu.container.get_parent();
    if (originalParent) {
        originalParentIndex = originalParent.get_children().indexOf(dateMenu.container);
    }

    // Move date menu to end of right box (recorded original position already)
    if (dateMenu.container.get_parent() === Main.panel._centerBox) {
        Main.panel._centerBox.remove_child(dateMenu.container);
        Main.panel._rightBox.insert_child_at_index(dateMenu.container, Main.panel._rightBox.get_children().length);
    }

    const keepNotificationPanel = kiwiSettings.get_boolean('keep-notification-panel');

    // Hide the notification list column of the date menu (shown in quick settings instead)
    if (!keepNotificationPanel) {
        originalMenuBoxStyle = originalMenuBoxStyle ?? dateMenu.menu.box.style;

        hiddenMessageList = dateMenu._messageList;
        hiddenMessageList.hide();

        // Size width to the calendar (plus padding); min-width allows natural growth
        const [, natW] = dateMenu._calendar.get_preferred_width(-1);
        dateMenu.menu.box.style = `min-width: ${Math.max(300, natW + 20)}px;`;
    }

    // Banner position belongs to NotificationRouter (the notch may take the banners over).
    // Pin them top-right in both modes so they appear there whether or not the GNOME
    // notification panel is kept.
    NotificationRouter.pinBanners(routerCleanup);

    // Set up notification indicator on QuickSettings
    setupNotificationIndicator();

    enabled = true;
}

export function disable() {
    dateMenu = Main.panel.statusArea.dateMenu;

    // Restore the message list if we hid it
    if (hiddenMessageList) {
        hiddenMessageList.show();
        hiddenMessageList = null;
    }

    // Restore style
    if (originalMenuBoxStyle !== undefined) {
        dateMenu.menu.box.style = originalMenuBoxStyle;
        originalMenuBoxStyle = undefined;
    }

    // Move back to original parent & position
    if (originalParent && dateMenu.container.get_parent() !== originalParent) {
        const currentParent = dateMenu.container.get_parent();
        if (currentParent)
            currentParent.remove_child(dateMenu.container);
        const children = originalParent.get_children();
        const insertIndex = Math.min(originalParentIndex, children.length);
        originalParent.insert_child_at_index(dateMenu.container, insertIndex);
    }

    // Clean up notification indicator
    cleanupNotificationIndicator();
    routerCleanup.dispose();

    enabled = false;
}

function checkForNotifications() {
    // Notifications still present count (not only unacknowledged ones): acknowledged ones
    // stay in the notification panel. The count includes banners still queued.
    return NotificationRouter.state().count > 0;
}
