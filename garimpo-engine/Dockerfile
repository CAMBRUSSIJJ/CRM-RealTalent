FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml requirements.lock ./
COPY garimpo ./garimpo
RUN --mount=type=secret,id=pip_ca \
    if [ -f /run/secrets/pip_ca ]; then export PIP_CERT=/run/secrets/pip_ca; fi; \
    chmod -R a+rX /app \
    && pip install --no-cache-dir -c requirements.lock . \
    && useradd --uid 10001 --create-home garimpo \
    && mkdir -p /data && chown garimpo:garimpo /data
ENV GARIMPO_DB=/data/garimpo.sqlite3 PYTHONUNBUFFERED=1
USER garimpo
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=4)"
CMD ["python", "-m", "garimpo", "serve", "--host", "0.0.0.0", "--port", "8765"]
