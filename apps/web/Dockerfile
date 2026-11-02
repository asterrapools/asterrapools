# Built by CI (.github/workflows/build.yml) from the repo root: docker build -f apps/web/Dockerfile .
# The VPS only pulls the image, so it never needs node_modules or a build cache.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
RUN pnpm install --frozen-lockfile --filter @asterrapools/web...
COPY apps/web apps/web
COPY packages/sdk packages/sdk
ARG NEXT_PUBLIC_NETWORK=testnet
ARG NEXT_PUBLIC_SITE_URL=https://testnet.asterrapools.tech
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=""
ARG NEXT_PUBLIC_FEATURES=""
ENV NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID \
    NEXT_PUBLIC_FEATURES=$NEXT_PUBLIC_FEATURES \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @asterrapools/sdk build && pnpm --filter @asterrapools/web build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
