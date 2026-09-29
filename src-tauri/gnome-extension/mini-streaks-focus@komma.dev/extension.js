// Publishes the focused window on the session bus for Mini Streaks.
// GNOME on Wayland doesn't let regular apps see which window is focused.
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE = `
<node>
  <interface name="dev.komma.MiniStreaks.Focus">
    <method name="GetFocused">
      <arg type="s" direction="out" name="app_id"/>
      <arg type="s" direction="out" name="app_name"/>
      <arg type="s" direction="out" name="wm_class"/>
      <arg type="s" direction="out" name="title"/>
    </method>
  </interface>
</node>`;

export default class MiniStreaksFocus extends Extension {
    enable() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/dev/komma/MiniStreaks/Focus');
    }

    disable() {
        this._dbus?.unexport();
        this._dbus = null;
    }

    GetFocused() {
        const win = global.display.get_focus_window();
        if (!win)
            return ['', '', '', ''];
        const app = Shell.WindowTracker.get_default().get_window_app(win);
        return [
            app?.get_id() ?? '',
            app?.get_name() ?? '',
            win.get_wm_class() ?? '',
            win.get_title() ?? '',
        ];
    }
}
