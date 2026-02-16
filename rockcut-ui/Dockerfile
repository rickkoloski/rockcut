# Build stage — install deps and build Vite app
FROM node:20-bookworm-slim AS builder

# Accept build args for API URL injection
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV DOCKER_BUILD=1

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies using Docker-specific package.json (no linked packages)
COPY package.docker.json ./package.json
COPY .npmrc ./
RUN pnpm install --no-frozen-lockfile

# Copy vendored datagrid-extended source (copied by deploy script before build)
COPY .datagrid-extended-src .datagrid-extended-src

# Copy source and build
COPY . .
RUN pnpm run build

# Production stage — serve with nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Ensure files are world-readable (fixes 403 on fly.io)
RUN chmod -R a+r /usr/share/nginx/html

EXPOSE 8080
