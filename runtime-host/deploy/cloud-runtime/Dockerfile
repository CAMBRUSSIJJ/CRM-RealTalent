FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    REALTALENT_CLOUD_DATA_DIR=/data
RUN apt-get update && apt-get install -y --no-install-recommends chromium python3 ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app
RUN cd /app/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/runtime/communications && npm install --omit=dev --no-fund --no-audit
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","deploy/cloud-runtime/cloud-runtime-supervisor.mjs"]
