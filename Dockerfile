FROM node:22-bookworm-slim AS node-runtime
FROM python:3.12-slim-bookworm
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
# A small separate dependency manifest for the shared engine (no web build required).
COPY backend/package.json backend/package-lock.json /app/
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
COPY --from=node-runtime /usr/local/bin/npm /usr/local/bin/npm
RUN npm ci --omit=dev && rm -rf /usr/local/lib/node_modules/npm
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY lib /app/lib
COPY data /app/data
COPY backend /app/backend
RUN useradd --create-home --uid 10001 scamshield && mkdir -p /aikart /app/storage && chown -R scamshield:scamshield /aikart /app/storage
ENV SCAMSHIELD_DB=/app/storage/scamshield.sqlite3
USER scamshield
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
