FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app/renderer
COPY renderer/ ./
COPY frontend/lib/editor-core.mjs /app/frontend/lib/editor-core.mjs
USER 33:33
EXPOSE 4000
CMD ["node","server.mjs"]
