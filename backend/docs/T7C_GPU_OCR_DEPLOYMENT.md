# Tranche T7-C: GPU OCR Worker Deployment

## Overview

Tranche T7-C implements the complete deployment infrastructure for the FiLot GPU OCR Worker to AWS ECS. This builds upon T7-B's GPU worker implementation by providing production-ready deployment scripts, ECS task definitions, and cluster configuration.

**Completion Date**: November 29, 2025

---

## Objectives Completed

1. ✅ Validated repository structure
2. ✅ Created AWS ECR setup script
3. ✅ Validated Dockerfile.gpu
4. ✅ Created build script for GPU worker
5. ✅ Created ECS task definition with GPU requirements
6. ✅ Created deployment script with all commands
7. ✅ Created ECS cluster and service configuration
8. ✅ Final validation of all artifacts

---

## Repository Structure

```
/
├── scripts/
│   ├── aws-ecr-setup-gpu.sh    # ECR repository setup and push
│   ├── build-gpu-worker.sh      # Docker image build
│   └── deploy-ocr-gpu.sh        # Main deployment orchestration
├── infra/
│   └── ecs/
│       ├── task-ocr-gpu.json    # ECS task definition
│       ├── cluster.json         # ECS cluster configuration
│       └── service-ocr-gpu.json # ECS service configuration
├── backend/
│   ├── Dockerfile.gpu           # GPU-enabled Docker image
│   └── src/workers/
│       └── ocr-gpu-worker.ts    # GPU OCR worker implementation
└── doc/
    └── T7C_GPU_OCR_DEPLOYMENT.md # This documentation
```

---

## Scripts Reference

### 1. aws-ecr-setup-gpu.sh

**Location**: `/scripts/aws-ecr-setup-gpu.sh`

Creates ECR repository, authenticates, tags, and pushes Docker image.

```bash
./scripts/aws-ecr-setup-gpu.sh
```

**Features**:
- Creates `filot-ocr-gpu-worker` ECR repository if not exists
- Logs into ECR
- Tags image for ECR
- Pushes image to ECR
- Platform: `linux/amd64`

---

### 2. build-gpu-worker.sh

**Location**: `/scripts/build-gpu-worker.sh`

Builds the GPU worker Docker image locally.

```bash
./scripts/build-gpu-worker.sh
```

**Features**:
- Builds from `backend/Dockerfile.gpu`
- Tags as `filot-ocr-gpu-worker:latest`
- Validates image exists after build
- Platform: `linux/amd64`

---

### 3. deploy-ocr-gpu.sh

**Location**: `/scripts/deploy-ocr-gpu.sh`

Main deployment orchestration script.

```bash
# Build only
./scripts/deploy-ocr-gpu.sh build

# Push to ECR only
./scripts/deploy-ocr-gpu.sh push

# Register ECS task definition only
./scripts/deploy-ocr-gpu.sh register

# Update ECS service only
./scripts/deploy-ocr-gpu.sh update

# Run full deployment pipeline
./scripts/deploy-ocr-gpu.sh all
```

---

## ECS Configuration

### Task Definition (task-ocr-gpu.json)

**Key Configuration**:
- **Image**: `070017891928.dkr.ecr.ap-southeast-2.amazonaws.com/filot-ocr-gpu-worker:latest`
- **CPU**: 2048 (2 vCPU)
- **Memory**: 8192 MB
- **GPU**: 1 (NVIDIA)
- **Shared Memory**: 2048 MB
- **Instance Type**: g5.xlarge (GPU-enabled)
- **Launch Type**: EC2 (not Fargate - GPU required)
- **Network Mode**: awsvpc (dynamic port allocation)

**Environment Variables**:
| Variable | Value | Description |
|----------|-------|-------------|
| OCR_GPU_ENABLED | true | Enable GPU processing |
| OCR_GPU_CONCURRENCY | 2 | Parallel processing jobs |
| OCR_GPU_AUTOFALLBACK | true | Fallback to CPU if GPU fails |
| OCR_GPU_MAX_RETRIES | 3 | Maximum retry attempts |
| OCR_GPU_POLL_INTERVAL | 1000 | Queue poll interval (ms) |
| OCR_GPU_QUEUE_KEY | filot:ocr:gpu:queue | Redis queue key |
| OCR_GPU_PROCESSING_KEY | filot:ocr:gpu:processing | Processing set key |
| OCR_GPU_ATTEMPTS_KEY | filot:ocr:gpu:attempts | Attempts hash key |
| OCR_GPU_PUBLISH_CHANNEL | filot:ocr:gpu:results | Results pub/sub channel |

**Secrets (AWS Secrets Manager)**:
- DATABASE_URL
- REDIS_URL
- REDIS_PASSWORD
- CF_R2_ENDPOINT
- CF_R2_ACCESS_KEY_ID
- CF_R2_SECRET_ACCESS_KEY
- CF_R2_BUCKET_NAME
- BULI2_API_URL
- BULI2_CALLBACK_URL

**Healthcheck**:
```json
{
  "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
  "interval": 30,
  "timeout": 10,
  "retries": 3,
  "startPeriod": 60
}
```

---

### Cluster Configuration (cluster.json)

- **Cluster Name**: `filot-ocr-gpu-cluster`
- **Container Insights**: Enabled
- **Execute Command**: Enabled with CloudWatch logging

---

### Service Configuration (service-ocr-gpu.json)

- **Service Name**: `filot-ocr-gpu-service`
- **Desired Count**: 1 (always running)
- **Launch Type**: EC2
- **Placement**: Spread across availability zones
- **Instance Constraint**: g5.* instances only
- **Circuit Breaker**: Enabled with rollback
- **Health Check Grace Period**: 120 seconds

**Note**: Update subnet and security group IDs before deployment:
- Replace `subnet-REPLACE_WITH_PRIVATE_SUBNET_1`
- Replace `subnet-REPLACE_WITH_PRIVATE_SUBNET_2`
- Replace `sg-REPLACE_WITH_SECURITY_GROUP`

---

## Dockerfile.gpu Validation

The Dockerfile at `/backend/Dockerfile.gpu` was validated and meets all requirements:

| Requirement | Status |
|------------|--------|
| CUDA Base Image (12.2.0-runtime-ubuntu22.04) | ✅ |
| Node.js 20 | ✅ |
| Tesseract OCR | ✅ |
| Indonesian Language Pack (tesseract-ocr-ind) | ✅ |
| Non-root User (filot) | ✅ |
| Port 8080 Exposed | ✅ |
| Healthcheck | ✅ |
| Multi-stage Build | ✅ |

---

## Deployment Steps

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. Docker installed and running
3. AWS account with ECR, ECS, and Secrets Manager access
4. g5.xlarge EC2 instances registered with ECS cluster

### Step-by-Step Deployment

```bash
# 1. Create ECR repository (if first time)
aws ecr create-repository --repository-name filot-ocr-gpu-worker --region ap-southeast-2

# 2. Create ECS cluster (if first time)
aws ecs create-cluster --cluster-name filot-ocr-gpu-cluster --region ap-southeast-2

# 3. Register GPU-enabled EC2 instances with the cluster
# (Use AWS Console or CLI to launch g5.xlarge instances with ECS agent)

# 4. Store secrets in AWS Secrets Manager
# (Create secrets for DATABASE_URL, REDIS_URL, etc.)

# 5. Run full deployment
./scripts/deploy-ocr-gpu.sh all

# OR run individual steps
./scripts/deploy-ocr-gpu.sh build
./scripts/deploy-ocr-gpu.sh push
./scripts/deploy-ocr-gpu.sh register
./scripts/deploy-ocr-gpu.sh update
```

### Creating the ECS Service (First Time)

After updating `service-ocr-gpu.json` with correct subnet and security group IDs:

```bash
aws ecs create-service \
  --cli-input-json file://infra/ecs/service-ocr-gpu.json \
  --region ap-southeast-2
```

---

## AWS Secrets Manager Requirements

Create the following secrets in AWS Secrets Manager (ap-southeast-2):

| Secret Name | Description |
|-------------|-------------|
| filot/database-url | PostgreSQL connection string |
| filot/redis-url | Redis connection URL |
| filot/redis-password | Redis password |
| filot/cf-r2-endpoint | Cloudflare R2 endpoint |
| filot/cf-r2-access-key | R2 access key ID |
| filot/cf-r2-secret-key | R2 secret access key |
| filot/cf-r2-bucket | R2 bucket name |
| filot/buli2-api-url | BULI2 review service URL |
| filot/buli2-callback-url | BULI2 callback URL |

---

## Monitoring & Logs

### CloudWatch Log Groups

- `/ecs/filot-ocr-gpu-worker` - Container logs
- `/ecs/filot-ocr-gpu-cluster` - Cluster execute command logs

### Viewing Logs

```bash
# View recent logs
aws logs tail /ecs/filot-ocr-gpu-worker --follow

# View specific time range
aws logs filter-log-events \
  --log-group-name /ecs/filot-ocr-gpu-worker \
  --start-time $(date -d '-1 hour' +%s)000
```

---

## Troubleshooting

### Common Issues

1. **Task fails to start**
   - Check if g5.* instance is registered with cluster
   - Verify GPU resources are available: `aws ecs describe-container-instances`
   - Check CloudWatch logs for errors

2. **Image pull fails**
   - Verify ECR login: `aws ecr get-login-password | docker login`
   - Check task execution role has ECR access
   - Verify image exists in ECR

3. **Secrets not loading**
   - Verify secrets exist in Secrets Manager
   - Check task execution role has secrets access
   - Verify secret ARNs in task definition

4. **Health check fails**
   - Verify `/health` endpoint is responding
   - Check container logs for startup errors
   - Increase `startPeriod` if needed

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS ECS Cluster                          │
│                    (filot-ocr-gpu-cluster)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    g5.xlarge Instance                      │  │
│  │                        (GPU-enabled)                       │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │          filot-ocr-gpu-service                       │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │  │
│  │  │  │       filot-ocr-gpu-worker Container          │  │  │  │
│  │  │  │                                               │  │  │  │
│  │  │  │  • NVIDIA CUDA 12.2                          │  │  │  │
│  │  │  │  • Tesseract OCR + Indonesian                │  │  │  │
│  │  │  │  • Node.js 20                                │  │  │  │
│  │  │  │  • Port 8080                                 │  │  │  │
│  │  │  │                                               │  │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │          External Services       │
            │  • Redis (Queue/Pub-Sub)         │
            │  • PostgreSQL (Database)         │
            │  • Cloudflare R2 (Storage)       │
            │  • BULI2 (Manual Review)         │
            └─────────────────────────────────┘
```

---

## Files Created in T7-C

| File | Purpose |
|------|---------|
| `/scripts/aws-ecr-setup-gpu.sh` | ECR repository and image push |
| `/scripts/build-gpu-worker.sh` | Docker image build |
| `/scripts/deploy-ocr-gpu.sh` | Deployment orchestration |
| `/infra/ecs/task-ocr-gpu.json` | ECS task definition |
| `/infra/ecs/cluster.json` | ECS cluster config |
| `/infra/ecs/service-ocr-gpu.json` | ECS service config |
| `/doc/T7C_GPU_OCR_DEPLOYMENT.md` | This documentation |

---

## Next Steps for AWS Deployment

1. **Create AWS Resources**:
   - Create ECS cluster: `aws ecs create-cluster --cluster-name filot-ocr-gpu-cluster`
   - Launch g5.xlarge EC2 instances with ECS agent
   - Create IAM roles (task role, execution role)

2. **Configure Secrets**:
   - Add all required secrets to AWS Secrets Manager

3. **Update Service Configuration**:
   - Replace placeholder subnet and security group IDs in `service-ocr-gpu.json`

4. **Deploy**:
   ```bash
   ./scripts/deploy-ocr-gpu.sh all
   ```

5. **Create Service**:
   ```bash
   aws ecs create-service --cli-input-json file://infra/ecs/service-ocr-gpu.json
   ```

6. **Monitor**:
   - Check CloudWatch logs
   - Monitor Container Insights metrics
   - Verify health check passes

---

## Validation Checklist

- [x] All scripts executable (`chmod +x`)
- [x] JSON files validated (valid syntax)
- [x] Dockerfile.gpu validated (meets all requirements)
- [x] Environment variables configured
- [x] Secrets referenced correctly
- [x] GPU requirements specified
- [x] Health check configured
- [x] Logging configured
- [x] Documentation complete

---

**Tranche T7-C Complete** ✅
