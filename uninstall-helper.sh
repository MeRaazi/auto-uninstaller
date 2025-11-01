#!/system/bin/sh

pkg="$1"
if [ -z "$pkg" ]; then
  echo "usage: $0 <package>"
  exit 2
fi

pm uninstall --user 0 "$pkg" >/dev/null 2>&1
exit 0
