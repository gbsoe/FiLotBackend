# FiLot Backend - Production Dockerfile (Fargate)
# Multi-stage build for optimal image size

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev) for building
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production runtime
FROM node:20-alpine

LABEL maintainer="FiLot Team"
LABEL description="FiLot Backend API - Financial AI Assistant"
LABEL version="1.0.0"
LABEL tranche="T8-B"

# Install production dependencies
RUN apk add --no-cache \
    curl \
    ca-certificates \
    tesseract-ocr

# Create non-root user (system user to avoid UID/GID conflicts)
RUN addgroup -S filot && \
    adduser -S filot -G filot

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create upload directory
RUN mkdir -p /app/uploads && chown -R filot:filot /app

# Environment
ENV NODE_ENV=production
ENV PORT=8080
ENV UPLOAD_DIR=/app/uploads

# Switch to non-root user
USER filot

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
