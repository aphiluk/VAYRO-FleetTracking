FROM oven/bun:1.3.14 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY gateway/package.json gateway/package.json
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/tracking-service/package.json services/tracking-service/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS source
COPY . .

FROM source AS api
ARG SERVICE=gateway
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app/${SERVICE}
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]

FROM source AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN bun run --bun build

FROM web-build AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN chown -R bun:bun .next
USER bun
EXPOSE 3000
CMD ["bun", "run", "--bun", "start", "--hostname", "0.0.0.0", "--port", "3000"]
