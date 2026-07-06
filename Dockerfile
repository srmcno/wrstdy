# Water Rate Study Tool — one-container deployment.
# Builds the app with the AI proxy wired to the same origin, then serves both
# the static app and the /api/ai endpoints from the dependency-free Node proxy.
#
#   docker build -t wrstdy .
#   docker run -p 8788:8788 \
#     -e ANTHROPIC_API_KEY=sk-ant-... \
#     -e OPENAI_API_KEY=sk-...        \
#     -e AI_AUTH_TOKEN=some-shared-access-code \
#     wrstdy
#
# Then open http://your-host:8788 — the app and its AI endpoint share one port,
# so no CORS setup is needed. See README "AI Analysis" for all env vars.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The app calls the AI proxy on its own origin.
ENV VITE_AI_PROXY_URL=/api/ai/messages
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY scripts/ai-proxy.js scripts/ai-proxy.js
ENV AI_STATIC_DIR=/app/dist
ENV AI_PROXY_PORT=8788
EXPOSE 8788
USER node
CMD ["node", "scripts/ai-proxy.js"]
