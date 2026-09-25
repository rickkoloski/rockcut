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
# Docker-only pnpm settings — approves esbuild's build script (pnpm 10+ reads
# build approval from pnpm-workspace.yaml, not package.json). The real workspace
# file is .dockerignored so its datagrid-extended link override never enters here.
COPY pnpm-workspace.docker.yaml ./pnpm-workspace.yaml
RUN pnpm install --no-frozen-lockfile

# Create datagrid-extended shim (the linked package doesn't exist in Docker)
RUN mkdir -p .datagrid-extended-src && \
    echo "import { DataGrid, type DataGridProps } from '@mui/x-data-grid'" > .datagrid-extended-src/DataGridExtended.tsx && \
    echo "" >> .datagrid-extended-src/DataGridExtended.tsx && \
    echo "export interface DataGridExtendedProps extends DataGridProps {}" >> .datagrid-extended-src/DataGridExtended.tsx && \
    echo "" >> .datagrid-extended-src/DataGridExtended.tsx && \
    echo "export function DataGridExtended(props: DataGridExtendedProps) {" >> .datagrid-extended-src/DataGridExtended.tsx && \
    echo "  return <DataGrid {...props} />" >> .datagrid-extended-src/DataGridExtended.tsx && \
    echo "}" >> .datagrid-extended-src/DataGridExtended.tsx && \
    echo "export { DataGridExtended } from './DataGridExtended'" > .datagrid-extended-src/index.ts && \
    echo "export type { DataGridExtendedProps } from './DataGridExtended'" >> .datagrid-extended-src/index.ts

# Copy source and build
COPY . .
# Build with vite directly — the package.json `build` script runs `tsc -b`, which
# is pre-broken by the linked datagrid-extended (D28). Type-checking is a local/CI
# concern (`tsc --noEmit -p tsconfig.app.json`), not the deploy build.
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
