# Production image: multi-stage, standalone Next.js output.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Mount the gateway registry at /app/gateways.json (or set LUMEN_CONSOLE_GATEWAYS)
# and provide each gateway's master key env var at runtime.
CMD ["node", "server.js"]
