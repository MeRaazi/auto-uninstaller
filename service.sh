#!/system/bin/sh

if [ -z "$MODPATH" ]; then
  MODPATH="/data/adb/modules/auto-uninstaller"
fi

MODDIR=/data/adb/modules/auto-uninstaller
CONFDIR="/data/adb/modules/AIB"
BLOCKLIST="$CONFDIR/app-blocklist.conf"
WHITELIST="$CONFDIR/app-whitelist.conf"
AGGRESSIVE_MODE_CONF="$MODDIR/aggressive_mode.conf"
SERVICE_ENABLED_CONF="$CONFDIR/service_enabled.conf"
APP_SNAPSHOT_FILE="$CONFDIR/app_snapshot.list"
API_LOGFILE="$CONFDIR/auto-uninstaller-api.log"
UNINSTALL_HELPER=$MODDIR/uninstall-helper.sh

[ ! -d "$CONFDIR" ] && mkdir -p "$CONFDIR" && chown root:root "$CONFDIR" && chmod 755 "$CONFDIR"

if [ ! -f "$BLOCKLIST" ]; then
  touch "$BLOCKLIST"
fi
chown root:root "$BLOCKLIST"
chmod 644 "$BLOCKLIST"

if [ ! -f "$WHITELIST" ]; then
  touch "$WHITELIST"
fi
chown root:root "$WHITELIST"
chmod 644 "$WHITELIST"

if [ ! -f "$SERVICE_ENABLED_CONF" ]; then
  echo "true" > "$SERVICE_ENABLED_CONF"
fi
chmod 644 "$SERVICE_ENABLED_CONF"

log_api() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - [SERVICE] $1" >> "$API_LOGFILE"
}

INOTIFYWAIT=$MODDIR/inotifywait

check_and_enforce() {
    if [ -f "$AGGRESSIVE_MODE_CONF" ] && [ "$(cat "$AGGRESSIVE_MODE_CONF")" = "true" ]; then
        enforce_aggressive_mode
    else
        enforce_standard_mode
    fi
}

enforce_standard_mode() {
    pm list packages -3 | awk -F: -v bl_file="$BLOCKLIST" -v wl_file="$WHITELIST" '
        BEGIN {
            while ((getline < bl_file) > 0) { if ($0 != "") b[$0] = 1 }
            close(bl_file)
            while ((getline < wl_file) > 0) { if ($0 != "") w[$0] = 1 }
            close(wl_file)
        }
        {
            pkg = $2
            if (pkg in b && !(pkg in w)) {
                print pkg
            }
        }
    ' | while read -r pkg_to_uninstall; do
        if [ -n "$pkg_to_uninstall" ]; then
            sh "$UNINSTALL_HELPER" "$pkg_to_uninstall" >/dev/null 2>&1
            log_api "Standard Mode: Auto-uninstalled '$pkg_to_uninstall' (from blocklist)."
        fi
    done
}

enforce_aggressive_mode() {
    pm list packages -3 | awk -F: -v wl_file="$WHITELIST" -v snap_file="$APP_SNAPSHOT_FILE" '
        BEGIN {
            while ((getline < wl_file) > 0) { if ($0 != "") w[$0] = 1 }
            close(wl_file)
            while ((getline < snap_file) > 0) { if ($0 != "") s[$0] = 1 }
            close(snap_file)
        }
        {
            pkg = $2
            if (!(pkg in w) && !(pkg in s)) {
                print pkg
            }
        }
    ' | while read -r pkg_to_uninstall; do
        if [ -n "$pkg_to_uninstall" ]; then
            sh "$UNINSTALL_HELPER" "$pkg_to_uninstall" >/dev/null 2>&1
            log_api "Aggressive Mode: Auto-uninstalled new app '$pkg_to_uninstall'."
        fi
    done
}

if [ "$(cat "$SERVICE_ENABLED_CONF")" = "true" ]; then
    check_and_enforce
fi

while true; do
    if [ "$(cat "$SERVICE_ENABLED_CONF")" = "true" ]; then
        $INOTIFYWAIT -rq -e create,moved_to /data/app
        sleep 3
        check_and_enforce
    else
        sleep 30
    fi
done