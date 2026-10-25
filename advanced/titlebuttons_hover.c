/*
 * Kiwi is not Apple – macOS-inspired enhancements for GNOME Shell.
 * Copyright (C) 2025  Arnis Kemlers
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * titlebuttons_hover.c: GTK3 module. While any titlebutton (minimize, maximize, close) of a
 * window is hovered, the window's headerbar gets the CSS class "titlebuttons-hover-alt", which
 * css/titlebuttons-alt3.css uses to highlight the whole group, like macOS.
 *
 * Event driven: an emission hook on GtkWidget::realize wires each titlebutton once. There is
 * no timer and no tree walk after the one-shot scan of windows that exist at load time.
 * The hover state is recomputed from the buttons' real PRELIGHT state instead of counting
 * enter/leave events, so a button that is hidden or rebuilt while hovered cannot leave the
 * class stuck.
 */

#define G_LOG_DOMAIN "kiwi-titlebuttons"

#include <gtk/gtk.h>
#include <gmodule.h>

#define HOVER_CLASS "titlebuttons-hover-alt"

static GQuark wired_quark;

static gboolean
is_titlebutton (GtkWidget *w)
{
  return GTK_IS_BUTTON (w) &&
         gtk_style_context_has_class (gtk_widget_get_style_context (w), "titlebutton");
}

static gboolean
any_titlebutton_prelit (GtkWidget *box)
{
  g_autoptr (GList) kids = gtk_container_get_children (GTK_CONTAINER (box));

  for (GList *l = kids; l != NULL; l = l->next)
    {
      GtkWidget *child = l->data;

      /* Only mapped buttons count: a hidden or destroyed button keeps PRELIGHT */
      if (is_titlebutton (child) &&
          gtk_widget_get_mapped (child) &&
          (gtk_widget_get_state_flags (child) & GTK_STATE_FLAG_PRELIGHT))
        return TRUE;
    }
  return FALSE;
}

static void
update_target (GtkWidget *button, GtkWidget *target)
{
  GtkWidget *box = gtk_widget_get_parent (button);
  GtkStyleContext *ctx = gtk_widget_get_style_context (target);

  if (box != NULL && GTK_IS_CONTAINER (box) && any_titlebutton_prelit (box))
    gtk_style_context_add_class (ctx, HOVER_CLASS);
  else
    gtk_style_context_remove_class (ctx, HOVER_CLASS);
}

static void
on_state_flags_changed (GtkWidget *button, GtkStateFlags previous, gpointer user_data)
{
  (void) previous;
  update_target (button, GTK_WIDGET (user_data));
}

static void
on_unmap (GtkWidget *button, gpointer user_data)
{
  /* Runs after GtkWidget's class handler, so the button is already unmapped.
   * Covers hide, window minimise and button rebuilds. */
  update_target (button, GTK_WIDGET (user_data));
}

static void
wire_button (GtkWidget *button)
{
  GtkWidget *hb, *target;

  if (g_object_get_qdata (G_OBJECT (button), wired_quark) != NULL)
    return;

  hb = gtk_widget_get_ancestor (button, GTK_TYPE_HEADER_BAR);
  target = hb != NULL ? hb : gtk_widget_get_parent (button);
  if (target == NULL)
    return;

  /* _object variants disconnect automatically when the target is finalized */
  g_signal_connect_object (button, "state-flags-changed",
                           G_CALLBACK (on_state_flags_changed), target, 0);
  g_signal_connect_object (button, "unmap", G_CALLBACK (on_unmap), target, 0);
  g_object_set_qdata (G_OBJECT (button), wired_quark, GINT_TO_POINTER (1));
}

static gboolean
on_widget_realize (GSignalInvocationHint *ihint,
                   guint                  n_params,
                   const GValue          *params,
                   gpointer               data)
{
  GtkWidget *w = g_value_get_object (&params[0]);

  (void) ihint; (void) n_params; (void) data;

  if (is_titlebutton (w))
    wire_button (w);
  return TRUE; /* returning FALSE would remove the hook after the first emission */
}

/* One-shot walk for windows that already exist when the module is loaded late
 * (the gtk-modules setting path). Includes internal children (decoration boxes). */
static void
wire_tree (GtkWidget *w, gpointer data)
{
  (void) data;

  if (is_titlebutton (w) && gtk_widget_get_realized (w))
    wire_button (w);
  if (GTK_IS_CONTAINER (w))
    gtk_container_forall (GTK_CONTAINER (w), wire_tree, NULL);
}

static gboolean
initial_scan (gpointer data)
{
  g_autoptr (GList) tops = gtk_window_list_toplevels ();

  (void) data;
  for (GList *l = tops; l != NULL; l = l->next)
    wire_tree (GTK_WIDGET (l->data), NULL);
  return G_SOURCE_REMOVE;
}

/* Code in this module is called from signal handlers; it must never be unloaded */
G_MODULE_EXPORT const gchar *
g_module_check_init (GModule *module)
{
  g_module_make_resident (module);
  return NULL;
}

G_MODULE_EXPORT void
gtk_module_init (gint *argc, gchar ***argv)
{
  (void) argc; (void) argv;

  wired_quark = g_quark_from_static_string ("kiwi-tb-wired");

  /* Signals exist only once the class is initialised; at module-init time nothing has
   * created a widget yet, so g_signal_lookup() would return 0 without this. */
  g_type_class_ref (GTK_TYPE_WIDGET);
  g_signal_add_emission_hook (g_signal_lookup ("realize", GTK_TYPE_WIDGET),
                              0, on_widget_realize, NULL, NULL);
  g_idle_add (initial_scan, NULL);
}
