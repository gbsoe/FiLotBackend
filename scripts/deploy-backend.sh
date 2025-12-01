#!/bin/bash
# FiLot Backend - Deployment Script (ECS Fargate)
# Supports: build, push, register, update, all
#
# Usage:
#   ./scripts/deploy-backend.sh build     - Build Docker image
#   ./scripts/deploy-backend.sh push      - Push to ECR
#   ./scripts/deploy-backend.sh register  - Register ECS task definition
#   ./scripts/deploy-backend.sh update    - Update ECS service
#   ./scripts/deploy-backend.sh all       - Run all above in order

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-070017891928}"
ECR_REPOSITORY="filot-backend"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECS_CLUSTER="filot-backend-cluster"
ECS_SERVICE="filot-backend-service"
TASK_DEFINITION_FILE="${PROJECT_ROOT}/infra/ecs/filot-backend-task.json"
SERVICE_DEFINITION_FILE="${PROJECT_ROOT}/infra/ecs/filot-backend-service.json"
IMAGE_TAG="${IMAGE_TAG:-latest}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

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
    echo "  FiLot Backend Deployment (Fargate)"
    echo "========================================"
    echo "AWS Region:     ${AWS_REGION}"
    echo "AWS Account ID: ${AWS_ACCOUNT_ID}"
    echo "ECR Repository: ${ECR_REPOSITORY}"
    echo "ECS Cluster:    ${ECS_CLUSTER}"
    echo "ECS Service:    ${ECS_SERVICE}"
    echo "Image Tag:      ${IMAGE_TAG}"
    echo "Timestamp:      ${TIMESTAMP}"
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

    if ! command -v jq &> /dev/null; then
        log_warn "jq is not installed - some features may not work"
    fi
    
    log_info "Prerequisites check passed."
}

verify_secrets() {
    log_step "Verifying required secrets in AWS Secrets Manager..."
    
    SECRETS=(
        "filot/jwt-secret"
        "filot/session-secret"
        "filot/service-internal-key"
        "filot/database-url"
        "filot/redis-url"
        "filot/redis-password"
        "filot/cf-r2-endpoint"
        "filot/cf-r2-access-key"
        "filot/cf-r2-secret-key"
        "filot/cf-r2-bucket"
        "filot/buli2-api-url"
        "filot/buli2-api-key"
    )
    
    MISSING_SECRETS=()
    
    for secret in "${SECRETS[@]}"; do
        if ! aws secretsmanager describe-secret --secret-id "$secret" --region "${AWS_REGION}" &> /dev/null; then
            MISSING_SECRETS+=("$secret")
        fi
    done
    
    if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
        log_error "Missing secrets:"
        for secret in "${MISSING_SECRETS[@]}"; do
            echo "  - $secret"
        done
        exit 1
    fi
    
    log_info "All required secrets verified."
}

verify_ecr_repo() {
    log_step "Verifying ECR repository exists..."
    
    if ! aws ecr describe-repositories --repository-names "${ECR_REPOSITORY}" --region "${AWS_REGION}" &> /dev/null; then
        log_warn "ECR repository ${ECR_REPOSITORY} not found. Creating..."
        aws ecr create-repository \
            --repository-name "${ECR_REPOSITORY}" \
            --region "${AWS_REGION}" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256
        log_info "ECR repository created."
    else
        log_info "ECR repository exists."
    fi
}

cmd_build() {
    log_step "Building Backend Docker image..."
    
    cd "${PROJECT_ROOT}/backend"
    
    docker build \
        --platform linux/amd64 \
        -t "${ECR_REPOSITORY}:${IMAGE_TAG}" \
        -t "${ECR_REPOSITORY}:${TIMESTAMP}" \
        -f Dockerfile \
        .
    
    log_info "Build completed: ${ECR_REPOSITORY}:${IMAGE_TAG}"
}

cmd_push() {
    log_step "Pushing Docker image to ECR..."
    
    verify_ecr_repo
    
    # Login to ECR
    aws ecr get-login-password --region "${AWS_REGION}" | \
        docker login --username AWS --password-stdin "${ECR_REGISTRY}"
    
    # Tag images
    docker tag "${ECR_REPOSITORY}:${IMAGE_TAG}" "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    docker tag "${ECR_REPOSITORY}:${IMAGE_TAG}" "${ECR_REGISTRY}/${ECR_REPOSITORY}:${TIMESTAMP}"
    
    # Push both tags
    docker push "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    docker push "${ECR_REGISTRY}/${ECR_REPOSITORY}:${TIMESTAMP}"
    
    # Get image digest
    IMAGE_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}" 2>/dev/null || echo "unknown")
    
    log_info "Push completed: ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    log_info "Image Digest: ${IMAGE_DIGEST}"
    
    # Update image-versions.json
    update_image_versions "backend" "${IMAGE_TAG}" "${IMAGE_DIGEST}"
}

update_image_versions() {
    local component=$1
    local tag=$2
    local digest=$3
    
    VERSION_FILE="${PROJECT_ROOT}/infra/deployments/T8-B/image-versions.json"
    
    if [ -f "${VERSION_FILE}" ]; then
        if command -v jq &> /dev/null; then
            jq --arg component "$component" \
               --arg tag "$tag" \
               --arg digest "$digest" \
               --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
               '.[$component] = {tag: $tag, digest: $digest, deployed_at: $timestamp}' \
               "${VERSION_FILE}" > "${VERSION_FILE}.tmp" && mv "${VERSION_FILE}.tmp" "${VERSION_FILE}"
        fi
    fi
}

cmd_register() {
    log_step "Registering ECS task definition..."
    
    if [ ! -f "${TASK_DEFINITION_FILE}" ]; then
        log_error "Task definition file not found: ${TASK_DEFINITION_FILE}"
        exit 1
    fi
    
    # Create temporary task definition with updated image tag
    TEMP_TASK_DEF="/tmp/filot-backend-task-def-temp.json"
    
    if command -v jq &> /dev/null; then
        # Update image tag in task definition
        FULL_IMAGE="${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
        jq --arg image "${FULL_IMAGE}" \
           '.containerDefinitions[0].image = $image' \
           "${TASK_DEFINITION_FILE}" > "${TEMP_TASK_DEF}"
        log_info "Updated image reference: ${FULL_IMAGE}"
    else
        cp "${TASK_DEFINITION_FILE}" "${TEMP_TASK_DEF}"
        log_warn "jq not found - using original task definition without image tag update"
    fi
    
    TASK_DEF_ARN=$(aws ecs register-task-definition \
        --cli-input-json file://${TEMP_TASK_DEF} \
        --region ${AWS_REGION} \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    log_info "Task definition registered: ${TASK_DEF_ARN}"
    
    echo "${TASK_DEF_ARN}" > /tmp/filot-backend-task-def-arn.txt
    
    # Cleanup
    rm -f "${TEMP_TASK_DEF}"
}

cmd_update() {
    log_step "Updating ECS service with new deployment..."
    
    TASK_DEF_ARN=""
    if [ -f "/tmp/filot-backend-task-def-arn.txt" ]; then
        TASK_DEF_ARN=$(cat /tmp/filot-backend-task-def-arn.txt)
    fi
    
    # Check if service exists
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
        
        # Wait for deployment to stabilize
        log_info "Waiting for service to stabilize..."
        aws ecs wait services-stable \
            --cluster "${ECS_CLUSTER}" \
            --services "${ECS_SERVICE}" \
            --region "${AWS_REGION}" || log_warn "Wait timed out - check deployment status manually"
    else
        log_warn "ECS service ${ECS_SERVICE} not found or not active."
        log_info "Creating new service..."
        
        if [ -f "${SERVICE_DEFINITION_FILE}" ]; then
            aws ecs create-service \
                --cli-input-json file://${SERVICE_DEFINITION_FILE} \
                --region ${AWS_REGION} > /dev/null
            log_info "Service created: ${ECS_SERVICE}"
        else
            log_error "Service definition file not found: ${SERVICE_DEFINITION_FILE}"
            exit 1
        fi
    fi
}

cmd_migrate() {
    log_step "Running database migrations..."
    
    # Run migrations using ECS run-task
    TASK_ARN=$(aws ecs run-task \
        --cluster "${ECS_CLUSTER}" \
        --task-definition "filot-backend-task" \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[subnet-REPLACE],securityGroups=[sg-REPLACE],assignPublicIp=DISABLED}" \
        --overrides '{"containerOverrides":[{"name":"filot-backend","command":["npm","run","db:push"]}]}' \
        --region "${AWS_REGION}" \
        --query 'tasks[0].taskArn' \
        --output text)
    
    log_info "Migration task started: ${TASK_ARN}"
    log_info "Check CloudWatch logs for migration output."
}

cmd_all() {
    log_step "Running full deployment pipeline..."
    
    verify_secrets
    echo ""
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

cmd_rollback() {
    log_step "Rolling back to previous task definition..."
    
    # Get previous task definition revision
    CURRENT_REV=$(aws ecs describe-services \
        --cluster "${ECS_CLUSTER}" \
        --services "${ECS_SERVICE}" \
        --region "${AWS_REGION}" \
        --query 'services[0].taskDefinition' \
        --output text | grep -oP ':\K\d+$')
    
    if [ -z "${CURRENT_REV}" ] || [ "${CURRENT_REV}" -le 1 ]; then
        log_error "Cannot rollback - no previous revision available"
        exit 1
    fi
    
    PREV_REV=$((CURRENT_REV - 1))
    
    aws ecs update-service \
        --cluster "${ECS_CLUSTER}" \
        --service "${ECS_SERVICE}" \
        --task-definition "filot-backend-task:${PREV_REV}" \
        --region "${AWS_REGION}" > /dev/null
    
    log_info "Rolled back to revision ${PREV_REV}"
}

show_usage() {
    echo "Usage: $0 [build|push|register|update|migrate|all|rollback]"
    echo ""
    echo "Commands:"
    echo "  build     Build Docker image locally"
    echo "  push      Push Docker image to AWS ECR"
    echo "  register  Register ECS task definition"
    echo "  update    Update ECS service with force new deployment"
    echo "  migrate   Run database migrations via ECS run-task"
    echo "  all       Run full deployment pipeline (default)"
    echo "  rollback  Rollback to previous task definition"
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
        migrate)
            cmd_migrate
            ;;
        all)
            cmd_all
            ;;
        rollback)
            cmd_rollback
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
