FROM oven/bun:1.3.14 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY gateway/package.json gateway/package.json
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/company-service/package.json services/company-service/package.json
COPY services/user-service/package.json services/user-service/package.json
COPY services/vehicle-service/package.json services/vehicle-service/package.json
COPY services/gps-device-service/package.json services/gps-device-service/package.json
COPY services/gps-data-service/package.json services/gps-data-service/package.json
COPY services/tracking-service/package.json services/tracking-service/package.json
COPY services/route-history-service/package.json services/route-history-service/package.json
COPY services/transport-service/package.json services/transport-service/package.json
COPY services/alert-service/package.json services/alert-service/package.json
COPY services/reporting-service/package.json services/reporting-service/package.json
COPY services/integration-service/package.json services/integration-service/package.json
COPY services/navigation-service/package.json services/navigation-service/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/service-kit/package.json packages/service-kit/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS source
COPY . .

FROM source AS api
ARG SERVICE=gateway
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app/${SERVICE}
# Services with a Prisma schema get their client generated into src/generated (gateway has none).
RUN if [ -f prisma/schema.prisma ]; then bunx --bun prisma generate; fi
USER bun
EXPOSE 3000
# "start" applies pending Prisma migrations, then runs the server.
CMD ["bun", "run", "start"]

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
