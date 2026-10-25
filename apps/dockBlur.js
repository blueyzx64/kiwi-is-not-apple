// SPDX-License-Identifier: GPL-3.0-or-later
// Dock glass (feature id 'dock-blur', kept so the settings and the feature list stay put).
//
// Liquid Glass is plain transparency now: no blur layer is inserted into Dash to Dock any
// more. The dock's translucent pill is Dash to Dock's own background (its transparency
// setting, plus apps/dockColors.js and apps/dockStyling.js when those are on), which is
// already rounded, so there is nothing left for this feature to draw. enable() and
// disable() stay as exact (empty) mirrors.

export function enable() {}

export function disable() {}
