#!/usr/bin/env bash
# shellcheck disable=SC1090

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/helpers.sh"

echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}Running post-attach setup script...${COLOR_RESET}"
echo -e "${COLOR_GREEN}Installing additional tools...${COLOR_RESET}"
echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"
echo ""

cp /home/vscode/.claude/.credentials.json /home/vscode/.claude-persist/.credentials.json 2>/dev/null || true
cp /home/vscode/.claude.json /home/vscode/.claude-persist/.claude.json 2>/dev/null || true

echo ""
echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}Post-attach setup script completed successfully!${COLOR_RESET}"
echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"

exit 0
