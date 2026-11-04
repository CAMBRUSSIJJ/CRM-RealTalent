FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    REALTALENT_COMMUNICATIONS_HOST=127.0.0.1 \
    REALTALENT_COMMUNICATIONS_PORT=3002 \
    REALTALENT_COMMUNICATIONS_STORE=/data/communications/store.json \
    REALTALENT_COMMUNICATIONS_KEY_FILE=/data/communications/key \
    REALTALENT_COMMUNICATIONS_CONFIG=/data/communications/config.json \
    REALTALENT_COMMUNICATIONS_MEDIA_DIR=/data/communications/media
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/ /app/launcher/scripts/
COPY runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/runtime/communications/package.json /app/launcher/runtime/communications/package.json
RUN cd /app/launcher/runtime/communications && npm install --omit=dev --no-fund --no-audit
COPY deploy/whatsapp-qr-qa/qa-supervisor.mjs /app/qa-supervisor.mjs
RUN mkdir -p /data/communications/media && chmod 700 /data/communications
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/qa-supervisor.mjs"]
