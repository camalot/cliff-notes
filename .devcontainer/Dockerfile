FROM mcr.microsoft.com/devcontainers/python:3

ARG USERNAME=vscode

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

USER root

RUN if id -u "${USERNAME}" >/dev/null 2>&1; then \
    usermod -m -d /home/${USERNAME} -s /bin/zsh "${USERNAME}"; \
  elif id -u ubuntu >/dev/null 2>&1; then \
    usermod -l "${USERNAME}" ubuntu; \
    if getent group ubuntu >/dev/null 2>&1; then groupmod -n "${USERNAME}" ubuntu; fi; \
    usermod -m -d /home/${USERNAME} -s /bin/zsh "${USERNAME}"; \
  else \
    useradd -m -s /bin/zsh "${USERNAME}"; \
  fi \
  && mkdir -p /home/${USERNAME}/bin/ /home/${USERNAME}/.zsh/ /home/${USERNAME}/.zsh_history/ /home/${USERNAME}/.ssh \
  && chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}


RUN apt-get update \
  && apt-get install -y --no-install-recommends apt-utils xauth apt-transport-https 2>&1 \
  && apt-get install -y --no-install-recommends git iproute2 procps lsb-release sudo gnupg 2>&1 \
  && apt-get install -y --no-install-recommends curl wget zip unzip dnsutils jq bat fzf zoxide direnv 2>&1 \
  && apt-get install -y --no-install-recommends nano vim zsh ripgrep eza imagemagick 2>&1 \
  && apt-get install -y --no-install-recommends python3-full python3-pip python3-venv golang-go python3-virtualenv 2>&1 \
  && pip3 install --no-cache-dir Pygments 2>&1 \
  && apt-get install -y --no-install-recommends \
    xvfb libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libpangocairo-1.0-0 libgtk-3-0 \
    libgdk-pixbuf-xlib-2.0-0 libx11-6 libxss1 libxtst6 libdbus-1-3 2>&1\
  && YQ_VERSION=$(curl -s "https://api.github.com/repos/mikefarah/yq/releases/latest" | jq -r ".tag_name" | sed 's/v//') \
  && curl -X GET -Ls "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" -o /usr/bin/yq \
  && chmod +x /usr/bin/yq \
  && apt-get autoremove -y \
  && apt-get clean -y \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /usr/local/bin && \
  ln -s /usr/bin/batcat /usr/local/bin/bat \
  && echo ${USERNAME} ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/${USERNAME} \
  && chmod 0440 /etc/sudoers.d/${USERNAME}

# install task (https://taskfile.dev/), a modern alternative to Make written in Go
RUN curl -1sLf 'https://dl.cloudsmith.io/public/task/task/setup.deb.sh' | /bin/bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends task \
  && apt-get clean -y \
  && rm -rf /var/lib/apt/lists/*

# Install PowerShell
RUN PWSH_TAG=$(curl -s "https://api.github.com/repos/PowerShell/PowerShell/releases/latest" | jq -r ".tag_name") \
  && PWSH_VERSION=${PWSH_TAG#v} \
  && curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/${PWSH_TAG}/powershell-${PWSH_VERSION}-linux-x64.tar.gz" -o /tmp/powershell.tar.gz \
  && mkdir -p /opt/microsoft/powershell/7 \
  && tar zxf /tmp/powershell.tar.gz -C /opt/microsoft/powershell/7 \
  && chmod +x /opt/microsoft/powershell/7/pwsh \
  && ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/pwsh \
  && ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/powershell \
  && rm /tmp/powershell.tar.gz \
  && curl -fsSL https://gh.io/copilot-install | bash


RUN curl -fsSL "https://deb.nodesource.com/setup_25.x" | bash - \
  && apt-get install -y nodejs \
  && node -v \
  && npm install -g npm \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /home/${USERNAME}/.nvm \
  && export NVM_DIR="/home/${USERNAME}/.nvm" \
  && for i in 1 2 3 4 5; do \
    git clone --depth 1 --branch v0.40.4 https://github.com/nvm-sh/nvm.git "${NVM_DIR}" && break || \
    { rm -rf "${NVM_DIR}"; sleep $((i * 2)); }; \
  done \
  && test -f "${NVM_DIR}/nvm.sh" \
  && chown -R ${USERNAME}:${USERNAME} "${NVM_DIR}" \
  && npm install -g pnpm git-cliff @anthropic-ai/claude-code \
  && npm cache clean --force

WORKDIR /workspace
USER ${USERNAME}

COPY --chown=${USERNAME}:${USERNAME} files/home/vscode/ /home/${USERNAME}/

RUN mkdir -p "/home/${USERNAME}/.antigen" "/home/${USERNAME}/.zsh/custom/aliases" "/home/${USERNAME}/.devcontainer" "/home/${USERNAME}/bin" "/home/${USERNAME}/.act" \
  && curl -fsSL https://raw.githubusercontent.com/zsh-users/antigen/master/bin/antigen.zsh > "/home/${USERNAME}/.antigen.zsh" \
  && ZSH_CUSTOM="/home/${USERNAME}/.oh-my-zsh/custom" \
  && mkdir -p "$ZSH_CUSTOM/themes" "/home/${USERNAME}/.antigen/bundles/romkatv" \
  && git clone --depth=1 'https://github.com/romkatv/powerlevel10k.git' "/home/${USERNAME}/.antigen/bundles/romkatv/powerlevel10k" \
  && ln -s "/home/${USERNAME}/.antigen/bundles/romkatv/powerlevel10k" "$ZSH_CUSTOM/themes/powerlevel10k" \
  && chown -R ${USERNAME}:${USERNAME} "/home/${USERNAME}/.oh-my-zsh" \
  && ACT_VERSION=$(curl -s "https://api.github.com/repos/nektos/act/releases/latest" | jq -r ".tag_name") \
  && curl -fsSL "https://github.com/nektos/act/releases/download/${ACT_VERSION}/act_Linux_x86_64.tar.gz" | tar -xz -C "/home/${USERNAME}/bin" \
  && chmod +x "/home/${USERNAME}/bin/act" \
  && ln -s "/home/${USERNAME}/bin/act" "/home/${USERNAME}/.act/act" \
  && curl -sSL https://install.python-poetry.org | python3 - \
  && curl -s https://ohmyposh.dev/install.sh | bash -s -- -d /home/${USERNAME}/bin \
  && TYPOS_VERSION=$(curl -s "https://api.github.com/repos/crate-ci/typos/releases/latest" | jq -r ".tag_name") \
  && curl -fsSL "https://github.com/crate-ci/typos/releases/download/${TYPOS_VERSION}/typos-${TYPOS_VERSION}-x86_64-unknown-linux-musl.tar.gz" | tar -xz -C "/home/${USERNAME}/bin"

# make sure that pnpm is available in the PATH for the vscode user and that the pnpm is up to date.
RUN export PATH="$HOME/.local/bin:$HOME/.local/share/pnpm/bin:$PATH"

# Reset SHELL to prevent pipefail from breaking devcontainer features installation
SHELL ["/bin/sh", "-c"]
