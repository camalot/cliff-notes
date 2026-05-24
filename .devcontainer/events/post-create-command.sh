#!/bin/bash
# shellcheck disable=SC1090
# Helper script executed during post-create to provision additional tooling inside
# the dev container that can't be installed during the image build (because the
# workspace isn't mounted yet).

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/helpers.sh"

function claude_init() {
  mkdir -p /home/vscode/.claude
  ([ -f /home/vscode/.claude-persist/.credentials.json ] && \
    cp /home/vscode/.claude-persist/.credentials.json /home/vscode/.claude/.credentials.json || true \
  ) && \
  ([ -f /home/vscode/.claude-persist/.claude.json ] && \
    cp /home/vscode/.claude-persist/.claude.json /home/vscode/.claude.json || \
      echo '{\"hasCompletedOnboarding\":true}' > /home/vscode/.claude.json
    )
}

function fix_ssh_permissions() {
  echo -e "${COLOR_BLUE}=================================================================${COLOR_RESET}"
  echo -e "${COLOR_BLUE}Fixing SSH key permissions...${COLOR_RESET}"

  if [ -d "$HOME/_ssh" ]; then
    echo -e "${COLOR_BLUE}Copying SSH files from $HOME/_ssh to $HOME/.ssh...${COLOR_RESET}"
    mkdir -p "$HOME/.ssh"
    cp -rp "$HOME/_ssh"/. "$HOME/.ssh/" 2>/dev/null || true
  elif [ -L "$HOME/.ssh" ]; then
    echo -e "${COLOR_BLUE}SSH directory is a symlink. Converting to a native directory...${COLOR_RESET}"
    SYMLINK_TARGET=$(readlink "$HOME/.ssh")
    rm "$HOME/.ssh"
    mkdir -p "$HOME/.ssh"
    cp -rp "$SYMLINK_TARGET"/. "$HOME/.ssh/" 2>/dev/null || true
  fi

  if [ -d "$HOME/.ssh" ]; then
    # Attempt to fix permissions for SSH keys, config, and known_hosts.
    # Ignore errors (e.g., if files are mounted read-only from Windows).
    chmod 700 "$HOME/.ssh" || true
    find "$HOME/.ssh" -type f -exec chmod 600 {} \; || true
    find "$HOME/.ssh" -type f -name "*.pub" -exec chmod 644 {} \; || true
    echo -e "${COLOR_GREEN}SSH key permissions fixed.${COLOR_RESET}"
  else
    echo -e "${COLOR_BLUE}No $HOME/.ssh directory found.${COLOR_RESET}"
  fi
  echo -e "${COLOR_BLUE}=================================================================${COLOR_RESET}"
  echo ""
}

echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}Running post-create setup script...${COLOR_RESET}"
echo -e "${COLOR_GREEN}Installing additional tools...${COLOR_RESET}"
echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"
echo ""

fix_ssh_permissions
claude_init

echo ""
echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}Post-create setup script completed successfully!${COLOR_RESET}"
echo -e "${COLOR_GREEN}=================================================================${COLOR_RESET}"

exit 0
