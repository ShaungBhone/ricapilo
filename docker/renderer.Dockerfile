FROM node:24-bookworm-slim
COPY --from=oven/bun:1.3.13 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-core libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 \
    libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/renderer
COPY renderer/package.json renderer/bun.lock ./
RUN bun install --frozen-lockfile
COPY renderer/ ./
COPY frontend/lib/editor-core.mjs frontend/lib/editor-core.d.mts frontend/lib/crop.mjs frontend/lib/crop.d.mts /app/frontend/lib/
COPY frontend/components/video-composition.tsx /app/frontend/components/video-composition.tsx
RUN node build.mjs && node browser.mjs && chown -R 33:33 /app/renderer
USER 33:33
EXPOSE 4000
CMD ["node","server.mjs"]
