#!/usr/bin/env bash
# Runs the recipe intake with its settings from ~/.hermes/recipe_intake.env (see infra/set-recipe-intake-token.sh).
set -euo pipefail

settings="${RECIPE_INTAKE_ENV:-$HOME/.hermes/recipe_intake.env}"
set -a
# shellcheck disable=SC1090
source "$settings"
set +a
export RECIPE_FILE="${RECIPE_FILE:-$HOME/Dropbox/org/resources/recipies.org}"
export RECIPE_STATE_FILE="${RECIPE_STATE_FILE:-$HOME/.hermes/workspace/state/recipe-intake-seen.json}"

exec node --experimental-strip-types --no-warnings "$(dirname "$(readlink -f "$0")")/recipe-intake.mts"
