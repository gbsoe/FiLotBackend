#!/bin/bash
# FiLot GPU OCR Worker - AWS ECR Setup Script
# Creates ECR repository, logs in, tags and pushes Docker image
#
# Usage: ./scripts/aws-ecr-setup-gpu.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-070017891928}"
ECR_REPOSITORY="filot-ocr-gpu-worker"
IMAGE_TAG="${IMAGE_TAG:-latest}"

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
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    log_info "Prerequisites check passed."
}

create_ecr_repository() {
    log_info "Checking if ECR repository exists: ${ECR_REPOSITORY}..."
    
    aws ecr describe-repositories --repository-names ${ECR_REPOSITORY} --region ${AWS_REGION} 2>/dev/null || \
    aws ecr create-repository \
        --repository-name ${ECR_REPOSITORY} \
        --region ${AWS_REGION} \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256
    
    log_info "ECR repository ready: ${ECR_REPOSITORY}"
}

login_to_ecr() {
    log_info "Logging into ECR..."
    
    ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    
    aws ecr get-login-password --region ${AWS_REGION} | \
        docker login --username AWS --password-stdin ${ECR_REGISTRY}
    
    log_info "Successfully logged into ECR: ${ECR_REGISTRY}"
}

tag_docker_image() {
    log_info "Tagging Docker image..."
    
    ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    LOCAL_IMAGE="${ECR_REPOSITORY}:${IMAGE_TAG}"
    REMOTE_IMAGE="${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    REMOTE_LATEST="${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
    
    if ! docker images "${LOCAL_IMAGE}" --format "{{.Repository}}:{{.Tag}}" | grep -q "${LOCAL_IMAGE}"; then
        log_error "Local image ${LOCAL_IMAGE} not found. Build it first with build-gpu-worker.sh"
        exit 1
    fi
    
    docker tag "${LOCAL_IMAGE}" "${REMOTE_IMAGE}"
    docker tag "${LOCAL_IMAGE}" "${REMOTE_LATEST}"
    
    log_info "Tagged image: ${REMOTE_IMAGE}"
    log_info "Tagged image: ${REMOTE_LATEST}"
}

push_docker_image() {
    log_info "Pushing Docker image to ECR..."
    
    ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    REMOTE_IMAGE="${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    REMOTE_LATEST="${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
    
    docker push "${REMOTE_IMAGE}"
    docker push "${REMOTE_LATEST}"
    
    log_info "Successfully pushed Docker image to ECR"
    log_info "Image URL: ${REMOTE_IMAGE}"
}

main() {
    log_info "========================================"
    log_info "FiLot GPU OCR Worker - ECR Setup"
    log_info "========================================"
    log_info "AWS Region: ${AWS_REGION}"
    log_info "AWS Account ID: ${AWS_ACCOUNT_ID}"
    log_info "ECR Repository: ${ECR_REPOSITORY}"
    log_info "Image Tag: ${IMAGE_TAG}"
    log_info "Platform: linux/amd64"
    log_info "========================================"
    
    check_prerequisites
    create_ecr_repository
    login_to_ecr
    tag_docker_image
    push_docker_image
    
    log_info "========================================"
    log_info "ECR setup completed successfully!"
    log_info "========================================"
}

main "$@"
