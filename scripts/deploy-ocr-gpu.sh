#!/bin/bash
# FiLot GPU OCR Worker - Deployment Script
# Supports: build, push, register, update, all
#
# Usage:
#   ./scripts/deploy-ocr-gpu.sh build     - Build Docker image
#   ./scripts/deploy-ocr-gpu.sh push      - Push to ECR
#   ./scripts/deploy-ocr-gpu.sh register  - Register ECS task definition
#   ./scripts/deploy-ocr-gpu.sh update    - Update ECS service
#   ./scripts/deploy-ocr-gpu.sh all       - Run all above in order

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-070017891928}"
ECR_REPOSITORY="filot-ocr-gpu-worker"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECS_CLUSTER="filot-ocr-gpu-cluster"
ECS_SERVICE="filot-ocr-gpu-service"
TASK_DEFINITION_FILE="${PROJECT_ROOT}/infra/ecs/task-ocr-gpu.json"
IMAGE_TAG="${IMAGE_TAG:-latest}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_banner() {
    echo ""
    echo "========================================"
    echo "  FiLot GPU OCR Worker Deployment"
    echo "========================================"
    echo "AWS Region:     ${AWS_REGION}"
    echo "AWS Account ID: ${AWS_ACCOUNT_ID}"
    echo "ECR Repository: ${ECR_REPOSITORY}"
    echo "ECS Cluster:    ${ECS_CLUSTER}"
    echo "ECS Service:    ${ECS_SERVICE}"
    echo "Image Tag:      ${IMAGE_TAG}"
    echo "========================================"
    echo ""
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    log_info "Prerequisites check passed."
}

cmd_build() {
    log_step "Building GPU OCR Worker Docker image..."
    
    if [ -f "${SCRIPT_DIR}/build-gpu-worker.sh" ]; then
        bash "${SCRIPT_DIR}/build-gpu-worker.sh"
    else
        log_error "build-gpu-worker.sh not found at ${SCRIPT_DIR}"
        exit 1
    fi
    
    log_info "Build completed."
}

cmd_push() {
    log_step "Pushing Docker image to ECR..."
    
    if [ -f "${SCRIPT_DIR}/aws-ecr-setup-gpu.sh" ]; then
        bash "${SCRIPT_DIR}/aws-ecr-setup-gpu.sh"
    else
        log_error "aws-ecr-setup-gpu.sh not found at ${SCRIPT_DIR}"
        exit 1
    fi
    
    log_info "Push completed."
}

cmd_register() {
    log_step "Registering ECS task definition..."
    
    if [ ! -f "${TASK_DEFINITION_FILE}" ]; then
        log_error "Task definition file not found: ${TASK_DEFINITION_FILE}"
        exit 1
    fi
    
    TASK_DEF_ARN=$(aws ecs register-task-definition \
        --cli-input-json file://${TASK_DEFINITION_FILE} \
        --region ${AWS_REGION} \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    log_info "Task definition registered: ${TASK_DEF_ARN}"
    
    echo "${TASK_DEF_ARN}" > /tmp/filot-task-def-arn.txt
}

cmd_update() {
    log_step "Updating ECS service with new deployment..."
    
    TASK_DEF_ARN=""
    if [ -f "/tmp/filot-task-def-arn.txt" ]; then
        TASK_DEF_ARN=$(cat /tmp/filot-task-def-arn.txt)
    fi
    
    if aws ecs describe-services --cluster "${ECS_CLUSTER}" --services "${ECS_SERVICE}" --region "${AWS_REGION}" 2>/dev/null | grep -q '"status": "ACTIVE"'; then
        if [ -n "${TASK_DEF_ARN}" ]; then
            aws ecs update-service \
                --cluster ${ECS_CLUSTER} \
                --service ${ECS_SERVICE} \
                --task-definition "${TASK_DEF_ARN}" \
                --force-new-deployment \
                --region ${AWS_REGION} > /dev/null
        else
            aws ecs update-service \
                --cluster ${ECS_CLUSTER} \
                --service ${ECS_SERVICE} \
                --force-new-deployment \
                --region ${AWS_REGION} > /dev/null
        fi
        
        log_info "ECS service updated: ${ECS_SERVICE}"
        log_info "Deployment triggered successfully."
    else
        log_warn "ECS service ${ECS_SERVICE} not found or not active."
        log_info "To create the service, use the service definition file:"
        log_info "  aws ecs create-service --cli-input-json file://infra/ecs/service-ocr-gpu.json"
    fi
}

cmd_all() {
    log_step "Running full deployment pipeline..."
    
    cmd_build
    echo ""
    cmd_push
    echo ""
    cmd_register
    echo ""
    cmd_update
    
    log_info "========================================"
    log_info "Full deployment pipeline completed!"
    log_info "========================================"
}

show_usage() {
    echo "Usage: $0 [build|push|register|update|all]"
    echo ""
    echo "Commands:"
    echo "  build     Build Docker image locally"
    echo "  push      Push Docker image to AWS ECR"
    echo "  register  Register ECS task definition"
    echo "  update    Update ECS service with force new deployment"
    echo "  all       Run all above commands in order (default)"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_REGION      AWS region (default: ap-southeast-2)"
    echo "  AWS_ACCOUNT_ID  AWS account ID (default: 070017891928)"
    echo "  IMAGE_TAG       Docker image tag (default: latest)"
}

main() {
    print_banner
    check_prerequisites
    
    case "${1:-all}" in
        build)
            cmd_build
            ;;
        push)
            cmd_push
            ;;
        register)
            cmd_register
            ;;
        update)
            cmd_update
            ;;
        all)
            cmd_all
            ;;
        -h|--help|help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
