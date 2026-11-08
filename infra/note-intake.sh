#!/usr/bin/env bash
# Runs the family notes intake. It shares the recipe intake's address and token, from ~/.hermes/recipe_intake.env
# (see infra/set-recipe-intake-token.sh), because the one integration token may add recipes and notes.
set -euo pipefail

settings="${RECIPE_INTAKE_ENV:-$HOME/.hermes/recipe_intake.env}"
set -a
# shellcheck disable=SC1090
source "$settings"
set +a
export NOTE_FILE="${NOTE_FILE:-$HOME/Dropbox/org/resources/family-notes.org}"
export NOTE_STATE_FILE="${NOTE_STATE_FILE:-$HOME/.hermes/workspace/state/note-intake-seen.json}"

exec node --experimental-strip-types --no-warnings "$(dirname "$(readlink -f "$0")")/note-intake.mts"
