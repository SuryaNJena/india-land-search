FROM node:24-bookworm-slim

ENV NODE_ENV=production BIND_HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --chown=node:node backend/server.mjs /app/backend/server.mjs
COPY --chown=node:node worker/odisha.mjs /app/worker/odisha.mjs
COPY --chown=node:node worker/odisha-map-snapshots.json /app/worker/odisha-map-snapshots.json
COPY --chown=node:node dist/core.mjs /app/dist/core.mjs
COPY --chown=node:node dist/odisha-endpoints.mjs /app/dist/odisha-endpoints.mjs
USER node
EXPOSE 8787
CMD ["node", "backend/server.mjs"]
