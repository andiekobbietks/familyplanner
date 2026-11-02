#!/usr/bin/env bash
# Connects one Google calendar to the live site (requirements section 5.3.1).
# Usage: bash infra/set-google-calendar.sh [label]
# Asks for the secret iCal address without showing it, so it stays out of the
# terminal and shell history. Replaces any calendar already set.
set -euo pipefail

label="${1:-Family}"
read -rsp 'Paste the secret iCal address, then press Enter (it stays hidden): ' url
echo

case "$url" in
  https://calendar.google.com/calendar/ical/*/basic.ics) ;;
  *)
    echo "That doesn't look like an iCal address. It should start https://calendar.google.com/calendar/ical/ and end /basic.ics" >&2
    exit 1
    ;;
esac

value=$(LABEL="$label" URL="$url" python3 -c 'import json, os; print(json.dumps([{"label": os.environ["LABEL"], "url": os.environ["URL"]}], separators=(",", ":")))')
az staticwebapp appsettings set -n familyplanner --setting-names "GOOGLE_CALENDARS=$value" -o none
echo "Saved calendar \"$label\"."
