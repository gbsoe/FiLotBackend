#!/bin/bash
# FiLot GPU OCR Worker - Build Script
# Builds the GPU worker Docker image for linux/amd64 platform
#
# Usage: ./scripts/build-gpu-worker.sh

set -euo pipefail

ECR_REPOSITORY="filot-ocr-gpu-worker"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKERFILE_PATH="backend/Dockerfile.gpu"
BUILD_CONTEXT="backend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    if [ ! -f "${DOCKERFILE_PATH}" ]; then
        log_error "Dockerfile not found at ${DOCKERFILE_PATH}"
        exit 1
    fi
    
    log_info "Prerequisites check passed."
}

build_image() {
    log_info "Building GPU OCR worker Docker image..."
    log_info "Dockerfile: ${DOCKERFILE_PATH}"
    log_info "Build context: ${BUILD_CONTEXT}"
    log_info "Platform: linux/amd64"
    log_info "Image tag: ${ECR_REPOSITORY}:${IMAGE_TAG}"
    
    docker build \
        --file "${DOCKERFILE_PATH}" \
        --platform linux/amd64 \
        --tag "${ECR_REPOSITORY}:${IMAGE_TAG}" \
        --tag "${ECR_REPOSITORY}:latest" \
        --build-arg NODE_ENV=production \
        "${BUILD_CONTEXT}"
    
    log_info "Docker image built successfully."
}

validate_image() {
    log_info "Validating built image..."
    
    echo ""
    log_info "Built images:"
    docker images "${ECR_REPOSITORY}" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}"
    echo ""
    
    if docker images "${ECR_REPOSITORY}:${IMAGE_TAG}" --format "{{.Repository}}:{{.Tag}}" | grep -q "${ECR_REPOSITORY}:${IMAGE_TAG}"; then
        log_info "Image validation passed: ${ECR_REPOSITORY}:${IMAGE_TAG}"
    else
        log_error "Image validation failed: ${ECR_REPOSITORY}:${IMAGE_TAG} not found"
        exit 1
    fi
}

main() {
    log_info "========================================"
    log_info "FiLot GPU OCR Worker - Build Script"
    log_info "========================================"
    
    check_prerequisites
    build_image
    validate_image
    
    log_info "========================================"
    log_info "Build completed successfully!"
    log_info "========================================"
    log_info "Next step: Run ./scripts/aws-ecr-setup-gpu.sh to push to ECR"
}

main "$@"
