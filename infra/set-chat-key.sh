#!/usr/bin/env bash
# Gives the live site its Anthropic API key, or replaces it, which turns chat on (S33).
# Needs `az login`. The key is typed at a hidden prompt, is never printed, and only this one app setting changes.
set -euo pipefail

read -rsp 'Anthropic API key: ' key
echo
if [[ "$key" != sk-ant-* ]]; then
  echo 'That does not look like an Anthropic API key, so nothing was changed.' >&2
  exit 1
fi

az staticwebapp appsettings set -n familyplanner --setting-names "ANTHROPIC_API_KEY=$key" -o none
echo 'Key saved to the app settings. Chat is on.'
