# syntax=docker/dockerfile:1

# Next.js 16 (Turbopack) -> image standalone (butuh output: "standalone" di next.config.ts).
#
# PENTING soal NEXT_PUBLIC_*: nilainya dibakar ke dalam bundle JavaScript saat
# `next build`, bukan dibaca saat container jalan. Jadi ia masuk lewat ARG di
# stage builder, bukan lewat `environment:` di docker-compose. Ganti nilainya
# -> wajib rebuild image, restart saja tidak cukup.
#
# Di belakang nginx (satu domain) isi NEXT_PUBLIC_API_URL dan NEXT_PUBLIC_SUPABASE_URL
# dengan "/" -> request jadi relatif (/api/v1/..., /auth/v1/...), tidak perlu rebuild
# saat pindah dari localhost ke VM.
# Jangan isi host.docker.internal: URL ini dibuka oleh BROWSER, bukan oleh container.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# ---------- dependencies ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEMO_DOSEN_EMAIL
ARG NEXT_PUBLIC_DEMO_MAHASISWA_EMAIL
ARG NEXT_PUBLIC_DEMO_PASSWORD
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_DEMO_DOSEN_EMAIL=$NEXT_PUBLIC_DEMO_DOSEN_EMAIL \
    NEXT_PUBLIC_DEMO_MAHASISWA_EMAIL=$NEXT_PUBLIC_DEMO_MAHASISWA_EMAIL \
    NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD \
    NEXT_TELEMETRY_DISABLED=1

# ARG yang tidak diisi jadi string kosong (bukan undefined), sehingga
# default `??` di kode tidak terpakai -> build sukses tapi FE rusak. Gagalkan build di sini.
RUN for v in NEXT_PUBLIC_API_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
             NEXT_PUBLIC_DEMO_DOSEN_EMAIL NEXT_PUBLIC_DEMO_MAHASISWA_EMAIL NEXT_PUBLIC_DEMO_PASSWORD; do \
      eval "val=\${$v}"; \
      [ -n "$val" ] || { echo "ERROR: build arg $v kosong"; exit 1; }; \
    done
RUN npm run build

# ---------- runtime ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
