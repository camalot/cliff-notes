#!/usr/bin/env bash
set -euo pipefail

# Configuration
MODULE_NAME="${1:-git-cliff}"
shift 1 # Remove the first argument (module name) to get the target ref as $1

if [ -z "$MODULE_NAME" ]; then
    echo "❌ Error: Please provide the submodule name as an argument."
    echo "Usage: $0 <submodule-name> <sha-or-tag>"
    exit 1
fi

SUBMODULE_PATH="workspace/submodules/$MODULE_NAME"

TARGET_REF="${1:-}"
shift 1 # Remove the first argument (tag or sha) to get the target ref as $1

if [ -z "$TARGET_REF" ]; then
    echo "❌ Error: Please provide a commit SHA or Tag as the second argument."
    echo "Usage: $0 $MODULE_NAME <sha-or-tag>"
    exit 1
fi

echo "🔄 Updating submodule at '$SUBMODULE_PATH' to point to '$TARGET_REF'..."

# 1. Fetch latest changes inside the submodule directory
git -C "$SUBMODULE_PATH" fetch --tags origin

# 2. Checkout the specific SHA or Tag
if ! git -C "$SUBMODULE_PATH" checkout "$TARGET_REF"; then
    echo "❌ Error: Could not find or checkout '$TARGET_REF' in the submodule."
    exit 1
fi

# 3. Stage the new submodule pointer in the main repository
git add "$SUBMODULE_PATH"

echo "✅ Success! Submodule is now pinned to $(git -C "$SUBMODULE_PATH" rev-parse HEAD)."
echo "👉 Run 'git commit -m \"chore(deps): update $MODULE_NAME submodule to $TARGET_REF\"' to save this change."
