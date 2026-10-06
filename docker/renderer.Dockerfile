FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY renderer/ ./
USER 33:33
EXPOSE 4000
CMD ["node","server.mjs"]
