#!/usr/bin/env bash
# Creates the token Hermes uses to add recipes to the live site (S31), or replaces it.
# Needs `az login`. The token is never printed, and only this one app setting changes.
set -euo pipefail

settings="$HOME/.hermes/recipe_intake.env"
url="$(az staticwebapp show -n familyplanner --query defaultHostname -o tsv)"
token="$(openssl rand -hex 32)"

az staticwebapp appsettings set -n familyplanner --setting-names "INTEGRATION_TOKEN=$token" -o none
umask 077
printf 'INTAKE_URL=https://%s\nINTEGRATION_TOKEN=%s\n' "$url" "$token" > "$settings"
echo "Token saved to $settings and to the app settings of $url."
