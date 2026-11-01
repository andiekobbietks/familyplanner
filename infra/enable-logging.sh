#!/bin/bash
# Adds Application Insights (S23) and points the API at it. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
oid=$(az ad sp list --display-name familyplanner-api --query '[0].id' -o tsv)
conn=$(az deployment group create -g rg-familyplanner -n familyplanner-logs -f infra/main.bicep \
  -p apiPrincipalId="$oid" alertEmail="${ALERT_EMAIL:?set ALERT_EMAIL to the budget alert address}" \
  --query properties.outputs.insightsConnectionString.value -o tsv)
az staticwebapp appsettings set -n familyplanner -g rg-familyplanner \
  --setting-names APPLICATIONINSIGHTS_CONNECTION_STRING="$conn" >/dev/null
keys=$(az staticwebapp appsettings list -n familyplanner -g rg-familyplanner --query 'keys(properties)' -o tsv)
echo "$keys" | grep -q AZURE_CLIENT_SECRET && echo "logging on, existing settings intact" || echo "WARNING: AZURE_CLIENT_SECRET missing, the API cannot reach Cosmos"
