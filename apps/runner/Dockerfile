# Playwright base image: Node 22 + Chromium + system deps preinstalled.
FROM mcr.microsoft.com/playwright:v1.48.0-noble

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy the workspace manifest + every package.json so pnpm can plan.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/runner/package.json apps/runner/

RUN pnpm install --filter @deal-match/runner... --frozen-lockfile || \
    pnpm install --filter @deal-match/runner...

# Copy sources (runner + shared types it imports).
COPY packages/shared packages/shared
COPY apps/runner apps/runner

WORKDIR /app/apps/runner

EXPOSE 8080
CMD ["pnpm", "start"]
