# =============================================================================
# Frontend (Next.js) Dockerfile — multi-stage, standalone output, 비root
#
# 빌드:
#   docker build \
#     --build-arg NEXT_PUBLIC_API_URL= \
#     -t ashfield-drive-frontend ./frontend
# =============================================================================

# -----------------------------------------------------------------------------
# Deps
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci


# -----------------------------------------------------------------------------
# Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 빌드 시점에 주입되는 public env (NEXT_PUBLIC_*은 빌드 시 inline)
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_API_TIMEOUT_MS=10000
ARG NEXT_PUBLIC_APP_NAME=Ashfield
ARG NEXT_PUBLIC_CALENDAR_URL=

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_API_TIMEOUT_MS=$NEXT_PUBLIC_API_TIMEOUT_MS \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_CALENDAR_URL=$NEXT_PUBLIC_CALENDAR_URL \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# 비root 사용자
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone output (next.config.ts에서 output: "standalone" 필요)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
