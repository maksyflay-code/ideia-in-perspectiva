FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/mapa.db \
    NODE_NO_WARNINGS=1
COPY --from=build /app/.output ./.output
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
