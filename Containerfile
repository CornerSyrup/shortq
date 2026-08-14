FROM oven/bun:debian

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
RUN bun install
COPY src ./src

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV SHOTQ_NO_SANDBOX=1

ENTRYPOINT ["bun", "run", "src/index.ts"]
