# syntax=docker/dockerfile:1.7
# Open_Edit production image: Next.js standalone output on Node 24, running as an unprivileged user.
#   docker build -t open_edit .
#   docker run -p 3000:3000 --env-file .env open_edit
# Build-time settings (NEXT_PUBLIC_ASSET_PACK, NEXT_PUBLIC_BASE_PATH, OE_COEP) are passed as build args.

ARG NODE_VERSION=24

# ---- dependencies
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_ASSET_PACK=open
ARG NEXT_PUBLIC_BASE_PATH=
ARG OE_COEP=credentialless
ENV NEXT_PUBLIC_ASSET_PACK=$NEXT_PUBLIC_ASSET_PACK NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH OE_COEP=$OE_COEP
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# postbuild copies public/ and .next/static into .next/standalone
RUN npm run build

# ---- runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 openedit && useradd --system --uid 1001 --gid openedit --no-create-home openedit
COPY --from=build --chown=openedit:openedit /app/.next/standalone ./
USER openedit
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+(process.env.NEXT_PUBLIC_BASE_PATH||'')+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
