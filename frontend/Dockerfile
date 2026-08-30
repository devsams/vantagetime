# Multi-stage build producing a lean runtime image via Next.js "standalone" output.
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at runtime — so the backend URL must be passed as a build arg
# (deploy the backend first, then pass its URL in here when building this
# image).
#
# The default below is VantageTime's actual deployed backend
# (vantagetime-backend on Cloud Run, us-central1) — confirmed necessary,
# not just a nicety: `gcloud run deploy --source .` builds Dockerfiles via
# Cloud Build's implicit docker-builder step, and its --set-build-env-vars
# flag does NOT translate to `docker build --build-arg` the way you'd
# expect (that flag is really for buildpacks). Without a real default
# here, ARG resolves to an empty string rather than being unset, which
# `lib/api.ts`'s old `??` fallback didn't catch either (fixed there too,
# but this default is what actually makes a plain `gcloud run deploy
# --source .` work correctly without a custom cloudbuild.yaml). Override
# with `--build-arg NEXT_PUBLIC_API_URL=...` on a local `docker build` if
# ever pointing at a different backend.
ARG NEXT_PUBLIC_API_URL=https://vantagetime-backend-425496362782.us-central1.run.app
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
EXPOSE 8080

CMD ["node", "server.js"]
