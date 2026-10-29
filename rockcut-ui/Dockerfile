# Build stage — install deps and build Vite app
FROM node:20-bookworm-slim AS builder

# Accept build args for API URL injection
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# D30: "DEV" on the DEV server shows the environment ribbon; empty on prod.
ARG VITE_ENV_LABEL
ENV VITE_ENV_LABEL=${VITE_ENV_LABEL}
# D45: optional build id (`fly deploy --build-arg VITE_BUILD_ID=…`), shown as
# <html data-build>; a different id also makes a new service worker.
ARG VITE_BUILD_ID
ENV VITE_BUILD_ID=${VITE_BUILD_ID}
# D51 (task 4669): the commit being deployed (`--build-arg VITE_GIT_SHA=$(git
# rev-parse HEAD)`), shown as <html data-sha> and in the DEV ribbon.
ARG VITE_GIT_SHA
ENV VITE_GIT_SHA=${VITE_GIT_SHA}

WORKDIR /app

# pnpm version comes from package.json `packageManager` (task 3999), not @latest.
RUN corepack enable

# Install exactly what pnpm-lock.yaml pins (task 3999). datagrid-extended is
# vendored under vendor/, so there are no linked packages and no Docker-only
# package.json, workspace file or shim.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
# Build with vite directly; type-checking and lint are part of the local gate
# (`tsc --noEmit -p tsconfig.app.json`, `pnpm lint`), not the deploy build.
RUN pnpm exec vite build

# Production stage — serve with nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Ensure files are world-readable (fixes 403 on fly.io)
RUN chmod -R a+r /usr/share/nginx/html

EXPOSE 8080
