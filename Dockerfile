# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY plugin ./plugin
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @job-harness/web build

FROM node:24-bookworm-slim AS renderer-runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV HOME=/tmp

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-cjk fonts-liberation fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /app
COPY --from=builder --chown=node:node /app /app
USER node

CMD ["pnpm", "--filter", "@job-harness/resume-renderer-service", "start"]

FROM node:24-bookworm-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /app
COPY --from=builder --chown=node:node /app /app
USER node

CMD ["pnpm", "--filter", "@job-harness/server", "start"]
