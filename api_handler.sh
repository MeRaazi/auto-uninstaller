#!/system/bin/sh

set -e

if [ -z "$MODPATH" ]; then
  MODPATH="/data/adb/modules/auto-uninstaller"
fi

MODDIR="/data/adb/modules/auto-uninstaller"
CONFDIR="/data/adb/modules/AIB"
BLOCKLIST="${CONFDIR}/app-blocklist.conf"
WHITELIST="${CONFDIR}/app-whitelist.conf"
AGGRESSIVE_MODE_CONF="${MODDIR}/aggressive_mode.conf"
APP_SNAPSHOT_FILE="${CONFDIR}/app_snapshot.list"
SERVICE_ENABLED_CONF="${MODDIR}/service_enabled.conf"
API_LOGFILE="${CONFDIR}/auto-uninstaller-api.log"
COMMAND="$1"

[ ! -d "$CONFDIR" ] && mkdir -p "$CONFDIR" && chown root:root "$CONFDIR" && chmod 755 "$CONFDIR"

api_log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$API_LOGFILE"
}

create_file_if_not_exists() {
    if [ ! -f "$1" ]; then
        touch "$1"
        chown root:root "$1"
        chmod 644 "$1"
    fi
}

create_file_if_not_exists "$BLOCKLIST"
create_file_if_not_exists "$WHITELIST"
create_file_if_not_exists "$SERVICE_ENABLED_CONF"

case "$COMMAND" in
  get)
    if [ -s "$BLOCKLIST" ]; then
        TMP_CLEAN=$(mktemp)
        tr -d '\r' < "$BLOCKLIST" | grep '.' | sort -u > "$TMP_CLEAN"
        mv "$TMP_CLEAN" "$BLOCKLIST"
        chmod 644 "$BLOCKLIST"
        chown root:root "$BLOCKLIST"

        awk 'NF {printf "%s%s", (NR==1 ? "" : ","), $0}' "$BLOCKLIST"
    fi
    ;;

  add)
    shift
    PACKAGE="$1"
    if [ -z "$PACKAGE" ]; then
      api_log "ADD failed: Empty package name."
      exit 1
    fi

    if ! grep -q -x -- "$PACKAGE" "$BLOCKLIST"; then
      api_log "Adding new package: [$PACKAGE]"
      printf '%s\n' "$PACKAGE" >> "$BLOCKLIST"
      chmod 644 "$BLOCKLIST"
    fi
    exit 0
    ;;

  remove)
    shift
    if [ $# -eq 0 ]; then
       api_log "REMOVE failed: No packages specified (\$# is 0). Arguments received: [$@]"
       exit 1
    fi
    
    api_log "Removing packages: [$@]" 
    
    PATTERNS_FILE=$(mktemp)
    TMP_FILE=$(mktemp)
    
    for pkg in "$@"; do
        echo "$pkg" >> "$PATTERNS_FILE"
    done
    
    grep -v -x -f "$PATTERNS_FILE" "$BLOCKLIST" > "$TMP_FILE" || true
    OLD_COUNT=$(wc -l < "$BLOCKLIST" 2>/dev/null)

    if [ -s "$TMP_FILE" ] || [ "$OLD_COUNT" -gt 0 ]; then
        api_log "Blocklist update initiated. Old count: $OLD_COUNT"

        if [ -s "$TMP_FILE" ]; then
            mv "$TMP_FILE" "$BLOCKLIST"
        else
            echo "" > "$BLOCKLIST" 
        fi
        
        api_log "Blocklist update complete. New count: $(wc -l < "$BLOCKLIST" 2>/dev/null)"
    fi

    rm -f "$PATTERNS_FILE" "$TMP_FILE"
    chown root:root "$BLOCKLIST"
    chmod 644 "$BLOCKLIST"
    ;;

  get_whitelist)
    if [ -s "$WHITELIST" ]; then
        TMP_CLEAN=$(mktemp)
        tr -d '\r' < "$WHITELIST" | grep '.' | sort -u > "$TMP_CLEAN"
        mv "$TMP_CLEAN" "$WHITELIST"
        chmod 644 "$WHITELIST"
        chown root:root "$WHITELIST"

        awk 'NF {printf "%s%s", (NR==1 ? "" : ","), $0}' "$WHITELIST"
    fi
    ;;

  add_whitelist)
    shift
    PACKAGE="$1"
    if [ -z "$PACKAGE" ]; then
      api_log "ADD_WHITELIST failed: Empty package name."
      exit 1
    fi

    if ! grep -q -x -- "$PACKAGE" "$WHITELIST"; then
      api_log "Adding new package to whitelist: [$PACKAGE]"
      printf '%s\n' "$PACKAGE" >> "$WHITELIST"
      chmod 644 "$WHITELIST"
    fi
    exit 0
    ;;

  remove_whitelist)
    shift
    if [ $# -eq 0 ]; then
       api_log "REMOVE_WHITELIST failed: No packages specified (\$# is 0). Arguments received: [$@]"
       exit 1
    fi
    
    api_log "Removing packages from whitelist: [$@]" 
    
    PATTERNS_FILE=$(mktemp)
    TMP_FILE=$(mktemp)
    
    for pkg in "$@"; do
        echo "$pkg" >> "$PATTERNS_FILE"
    done
    
    grep -v -x -f "$PATTERNS_FILE" "$WHITELIST" > "$TMP_FILE" || true
    OLD_COUNT=$(wc -l < "$WHITELIST" 2>/dev/null)

    if [ -s "$TMP_FILE" ] || [ "$OLD_COUNT" -gt 0 ]; then
        api_log "Whitelist update initiated. Old count: $OLD_COUNT"

        if [ -s "$TMP_FILE" ]; then
            mv "$TMP_FILE" "$WHITELIST"
        else
            echo "" > "$WHITELIST" 
        fi
        
        api_log "Whitelist update complete. New count: $(wc -l < "$WHITELIST" 2>/dev/null)"
    fi

    rm -f "$PATTERNS_FILE" "$TMP_FILE"
    chown root:root "$WHITELIST"
    chmod 644 "$WHITELIST"
    ;;

  get_aggressive_mode_status)
    if [ -f "$AGGRESSIVE_MODE_CONF" ] && [ "$(cat "$AGGRESSIVE_MODE_CONF")" = "true" ]; then
      echo "true"
    else
      echo "false"
    fi
    ;;

  set_aggressive_mode_status)
    shift
    STATUS="$1"
    if [ "$STATUS" = "true" ]; then
      echo "true" > "$AGGRESSIVE_MODE_CONF"
      pm list packages -3 | awk -F: '{print $2}' > "$APP_SNAPSHOT_FILE"
      chown root:root "$APP_SNAPSHOT_FILE"
      chmod 644 "$APP_SNAPSHOT_FILE"
      api_log "Aggressive Mode enabled. App snapshot taken."
    else
      echo "false" > "$AGGRESSIVE_MODE_CONF"
      rm -f "$APP_SNAPSHOT_FILE"
      api_log "Aggressive Mode disabled."
    fi
    chown root:root "$AGGRESSIVE_MODE_CONF"
    chmod 644 "$AGGRESSIVE_MODE_CONF"
    exit 0
    ;;

  get_service_status)
    if [ -f "$SERVICE_ENABLED_CONF" ] && [ "$(cat "$SERVICE_ENABLED_CONF")" = "true" ]; then
      echo "true"
    else
      echo "false"
    fi
    ;;

  set_service_status)
    shift
    STATUS="$1"
    if [ "$STATUS" = "true" ]; then
      echo "true" > "$SERVICE_ENABLED_CONF"
      api_log "Service enabled by user."
    else
      echo "false" > "$SERVICE_ENABLED_CONF"
      api_log "Service disabled by user."
    fi
    chown root:root "$SERVICE_ENABLED_CONF"
    chmod 644 "$SERVICE_ENABLED_CONF"
    exit 0
    ;;

  get_installed_apps)
    pm list packages -3 | awk -F: '{print $2}' | sort -u | awk 'NF {printf "%s%s", (NR==1 ? "" : ","), $0}'
    ;;
  *)
    echo "Error: Unknown command." >&2
    exit 127
    ;;
esac