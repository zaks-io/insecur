FROM node:24-bookworm

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  PIPX_HOME=/opt/pipx \
  PIPX_BIN_DIR=/usr/local/bin

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fd-find \
    file \
    git \
    gnupg \
    jq \
    less \
    make \
    nmap \
    openssh-client \
    perl \
    libjson-perl \
    libxml-writer-perl \
    pipx \
    python3 \
    python3-venv \
    ripgrep \
    shellcheck \
    sqlmap \
    sudo \
    unzip \
    vim-tiny \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
  && . /etc/os-release \
  && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/postgresql.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    postgresql-17 \
    postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/fdfind /usr/local/bin/fd

RUN corepack enable \
  && corepack install -g pnpm@10.19.0

COPY install-agent-tools.sh /tmp/install-agent-tools.sh
RUN bash /tmp/install-agent-tools.sh \
  && rm /tmp/install-agent-tools.sh

RUN usermod -aG sudo node \
  && printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -euo pipefail' \
    'exec /usr/bin/bash "$PWD/.cursor/start-postgres.sh"' \
    > /usr/local/bin/insecur-start-postgres \
  && chmod 0755 /usr/local/bin/insecur-start-postgres \
  && printf '%s\n' \
    'node ALL=(root) NOPASSWD:/usr/local/bin/insecur-start-postgres' \
    > /etc/sudoers.d/node \
  && chmod 0440 /etc/sudoers.d/node \
  && mkdir -p /workspaces/insecur \
  && chown -R node:node /workspaces

USER node
RUN corepack install -g pnpm@10.19.0

WORKDIR /workspaces/insecur
