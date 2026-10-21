FROM oven/bun:1.3.11 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

FROM oven/bun:1.3.11 AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=8081
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
USER bun
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["bun", "-e", "fetch('http://127.0.0.1:8081/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["bun", "src/index.ts"]
