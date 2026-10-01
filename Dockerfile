FROM node:22-bookworm-slim AS node-runtime
FROM node-runtime AS demo-build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend ./frontend
COPY app ./app
COPY lib ./lib
COPY data ./data
COPY public ./public
COPY vite.demo.config.ts postcss.config.mjs ./
RUN npm run build:demo
FROM python:3.12-slim-bookworm
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
# A small separate dependency manifest for the shared engine (no web build required).
COPY backend/package.json backend/package-lock.json /app/
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
COPY --from=node-runtime /usr/local/bin/npm /usr/local/bin/npm
RUN npm ci --ignore-scripts --omit=dev && rm -rf /usr/local/lib/node_modules/npm
COPY backend/requirements.lock /app/backend/requirements.lock
RUN pip install --no-cache-dir --only-binary=:all: --require-hashes -r backend/requirements.lock
COPY lib /app/lib
COPY data /app/data
COPY backend /app/backend
COPY --from=demo-build /build/dist-demo /app/dist-demo
RUN useradd --create-home --uid 10001 scamshield && mkdir -p /aikart /app/storage && chown -R scamshield:scamshield /aikart /app/storage
ENV SCAMSHIELD_DB=/app/storage/scamshield.sqlite3
USER scamshield
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
