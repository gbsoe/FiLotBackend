#!/bin/bash
# FiLot GPU OCR Worker Deployment Script
# Usage: ./scripts/deploy-ocr-gpu.sh [build|push|deploy|all]

set -euo pipefail

# Configuration
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
ECR_REPOSITORY="${ECR_REPOSITORY:-filot-ocr-gpu-worker}"
ECS_CLUSTER="${ECS_CLUSTER:-filot-production}"
ECS_SERVICE="${ECS_SERVICE:-filot-ocr-gpu-worker}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"

# Colors for output
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
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if [ -z "$AWS_ACCOUNT_ID" ]; then
        log_info "AWS_ACCOUNT_ID not set, fetching from STS..."
        AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
    fi
    
    ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    log_info "ECR Registry: ${ECR_REGISTRY}"
    log_info "Image Tag: ${IMAGE_TAG}"
}

login_ecr() {
    log_info "Logging into ECR..."
    aws ecr get-login-password --region "${AWS_REGION}" | \
        docker login --username AWS --password-stdin "${ECR_REGISTRY}"
}

create_ecr_repository() {
    log_info "Checking/creating ECR repository..."
    
    if ! aws ecr describe-repositories --repository-names "${ECR_REPOSITORY}" --region "${AWS_REGION}" &> /dev/null; then
        log_info "Creating ECR repository: ${ECR_REPOSITORY}"
        aws ecr create-repository \
            --repository-name "${ECR_REPOSITORY}" \
            --region "${AWS_REGION}" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256
    else
        log_info "ECR repository already exists: ${ECR_REPOSITORY}"
    fi
}

build_image() {
    log_info "Building GPU OCR worker Docker image..."
    
    cd "$(dirname "$0")/.."
    
    docker build \
        --file Dockerfile.gpu \
        --tag "${ECR_REPOSITORY}:${IMAGE_TAG}" \
        --tag "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}" \
        --tag "${ECR_REGISTRY}/${ECR_REPOSITORY}:latest" \
        --build-arg NODE_ENV=production \
        .
    
    log_info "Docker image built successfully"
}

push_image() {
    log_info "Pushing Docker image to ECR..."
    
    docker push "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    docker push "${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
    
    log_info "Docker image pushed successfully"
}

create_cloudwatch_log_group() {
    log_info "Checking/creating CloudWatch log group..."
    
    LOG_GROUP="/ecs/filot-ocr-gpu-worker"
    
    if ! aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${AWS_REGION}" 2>/dev/null | grep -q "\"logGroupName\": \"${LOG_GROUP}\""; then
        log_info "Creating CloudWatch log group: ${LOG_GROUP}"
        aws logs create-log-group \
            --log-group-name "${LOG_GROUP}" \
            --region "${AWS_REGION}" || true
        
        aws logs put-retention-policy \
            --log-group-name "${LOG_GROUP}" \
            --retention-in-days 30 \
            --region "${AWS_REGION}" || true
    else
        log_info "CloudWatch log group already exists: ${LOG_GROUP}"
    fi
}

register_task_definition() {
    log_info "Registering ECS task definition..."
    
    TASK_DEF_FILE="$(dirname "$0")/../infra/ecs/task-ocr-gpu.json"
    
    TASK_DEF=$(cat "${TASK_DEF_FILE}" | \
        sed "s/\${AWS_ACCOUNT_ID}/${AWS_ACCOUNT_ID}/g" | \
        sed "s/\${AWS_REGION}/${AWS_REGION}/g" | \
        sed "s/\${ECR_REGISTRY}/${ECR_REGISTRY}/g" | \
        sed "s/\${ECR_REPOSITORY}/${ECR_REPOSITORY}/g" | \
        sed "s/\${IMAGE_TAG}/${IMAGE_TAG}/g")
    
    TASK_DEF_ARN=$(echo "${TASK_DEF}" | aws ecs register-task-definition \
        --cli-input-json file:///dev/stdin \
        --region "${AWS_REGION}" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    log_info "Task definition registered: ${TASK_DEF_ARN}"
    
    echo "${TASK_DEF_ARN}"
}

update_service() {
    local TASK_DEF_ARN="$1"
    
    log_info "Updating ECS service..."
    
    if aws ecs describe-services --cluster "${ECS_CLUSTER}" --services "${ECS_SERVICE}" --region "${AWS_REGION}" 2>/dev/null | grep -q '"status": "ACTIVE"'; then
        aws ecs update-service \
            --cluster "${ECS_CLUSTER}" \
            --service "${ECS_SERVICE}" \
            --task-definition "${TASK_DEF_ARN}" \
            --force-new-deployment \
            --region "${AWS_REGION}" > /dev/null
        
        log_info "ECS service updated successfully"
    else
        log_warn "ECS service ${ECS_SERVICE} not found. Please create it manually."
        log_info "To create the service, use:"
        echo ""
        echo "aws ecs create-service \\"
        echo "    --cluster ${ECS_CLUSTER} \\"
        echo "    --service-name ${ECS_SERVICE} \\"
        echo "    --task-definition ${TASK_DEF_ARN} \\"
        echo "    --desired-count 1 \\"
        echo "    --launch-type EC2 \\"
        echo "    --placement-constraints type=memberOf,expression='attribute:ecs.instance-type =~ g4dn.*' \\"
        echo "    --region ${AWS_REGION}"
    fi
}

verify_gpu_instances() {
    log_info "Checking for GPU-enabled EC2 instances in cluster..."
    
    INSTANCES=$(aws ecs list-container-instances \
        --cluster "${ECS_CLUSTER}" \
        --region "${AWS_REGION}" \
        --query 'containerInstanceArns' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$INSTANCES" ]; then
        log_warn "No container instances found in cluster ${ECS_CLUSTER}"
        log_warn "Ensure you have g4dn.* instances registered with the cluster"
        return 1
    fi
    
    GPU_COUNT=$(aws ecs describe-container-instances \
        --cluster "${ECS_CLUSTER}" \
        --container-instances ${INSTANCES} \
        --region "${AWS_REGION}" \
        --query 'containerInstances[*].registeredResources[?name==`GPU`].integerValue' \
        --output text 2>/dev/null | grep -v "None" | wc -w || echo "0")
    
    if [ "$GPU_COUNT" -eq 0 ]; then
        log_warn "No GPU resources found in cluster instances"
        log_warn "Ensure you have g4dn.* instances with GPU support"
        return 1
    fi
    
    log_info "Found ${GPU_COUNT} GPU-enabled instance(s) in cluster"
    return 0
}

deploy() {
    check_prerequisites
    login_ecr
    create_ecr_repository
    create_cloudwatch_log_group
    verify_gpu_instances || true
    TASK_DEF_ARN=$(register_task_definition)
    update_service "${TASK_DEF_ARN}"
}

all() {
    check_prerequisites
    login_ecr
    create_ecr_repository
    build_image
    push_image
    create_cloudwatch_log_group
    verify_gpu_instances || true
    TASK_DEF_ARN=$(register_task_definition)
    update_service "${TASK_DEF_ARN}"
}

case "${1:-all}" in
    build)
        check_prerequisites
        build_image
        ;;
    push)
        check_prerequisites
        login_ecr
        create_ecr_repository
        push_image
        ;;
    deploy)
        deploy
        ;;
    all)
        all
        ;;
    *)
        echo "Usage: $0 [build|push|deploy|all]"
        echo ""
        echo "Commands:"
        echo "  build   - Build Docker image only"
        echo "  push    - Push image to ECR"
        echo "  deploy  - Register task definition and update service"
        echo "  all     - Build, push, and deploy (default)"
        exit 1
        ;;
esac

log_info "Deployment completed successfully!"
