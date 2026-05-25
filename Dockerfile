###############################################################################
# cliff-notes: single multi-stage image.
# Stage 1 (deps):    install workspace deps with pnpm
# Stage 2 (build):   build shared, api, and web
# Stage 3 (runtime): node + git + git-cliff, serving the SPA from the API
###############################################################################

ARG NODE_VERSION=20
ARG GIT_CLIFF_VERSION=2.7.0

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY tests/e2e/package.json ./tests/e2e/
RUN pnpm install --frozen-lockfile=false --ignore-scripts


FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @cliff-notes/shared run build && \
    pnpm --filter @cliff-notes/api run build && \
    pnpm --filter @cliff-notes/web run build


FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG GIT_CLIFF_VERSION
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/static \
    CONFIGS_DIR=/app/.cliff-configs \
    GIT_CLIFF_BIN=/usr/local/bin/git-cliff \
    GIT_BIN=/usr/bin/git
WORKDIR /app

# git for cloning, ca-certs for TLS, tini for proper signal handling
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tini curl \
 && rm -rf /var/lib/apt/lists/*

# Install the git-cliff binary (musl static build runs on glibc systems too)
RUN ARCH=$(uname -m) && \
    case "$ARCH" in \
      x86_64)   GC_ASSET=git-cliff-${GIT_CLIFF_VERSION}-x86_64-unknown-linux-musl.tar.gz ;; \
      aarch64)  GC_ASSET=git-cliff-${GIT_CLIFF_VERSION}-aarch64-unknown-linux-musl.tar.gz ;; \
      *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/orhun/git-cliff/releases/download/v${GIT_CLIFF_VERSION}/${GC_ASSET}" \
      | tar -xz -C /tmp && \
    install -m 0755 "/tmp/git-cliff-${GIT_CLIFF_VERSION}/git-cliff" /usr/local/bin/git-cliff && \
    rm -rf /tmp/git-cliff-* && \
    git-cliff --version

# Install only production deps in the runtime image
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
# Workspace install with only the api filter (and its transitive shared dep)
RUN pnpm install --prod --filter @cliff-notes/api... --ignore-scripts

# Copy built artifacts
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/dist ./static
COPY .cliff-configs ./.cliff-configs

# Run as a non-root user
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 cliffnotes && \
    chown -R cliffnotes:cliffnotes /app
USER cliffnotes

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
