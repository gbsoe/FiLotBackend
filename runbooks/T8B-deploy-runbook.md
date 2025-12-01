# T8-B Production Deployment Runbook

## FiLot Backend + GPU OCR Worker Deployment Guide

**Version**: 1.0.0  
**Tranche**: T8-B  
**Last Updated**: 2024-12-01

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Deployment Steps](#deployment-steps)
5. [Post-Deployment Validation](#post-deployment-validation)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting](#troubleshooting)
8. [Operations Guide](#operations-guide)

---

## Overview

This runbook covers the production deployment of:

- **FiLot Backend API** - ECS Fargate service
- **GPU OCR Worker** - ECS EC2 service on g5.xlarge instances

### Architecture

```
                    ┌──────────────┐
                    │     ALB      │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐   ┌───────▼──────┐   ┌───────▼──────┐
│   Backend    │   │   Backend    │   │   Backend    │
│  (Fargate)   │   │  (Fargate)   │   │  (Fargate)   │
└───────┬──────┘   └───────┬──────┘   └───────┬──────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼────┐ ┌─────▼─────┐ ┌────▼─────┐
       │   Redis   │ │ PostgreSQL │ │   R2     │
       │ (Upstash) │ │  (Neon)   │ │ Storage  │
       └───────────┘ └───────────┘ └──────────┘
              │
       ┌──────▼──────┐
       │ GPU Worker  │
       │ (EC2 g5.xl) │
       └─────────────┘
```

---

## Prerequisites

### 1. AWS Secrets Manager Secrets

All secrets must be present before deployment:

| Secret Path | Contents |
|-------------|----------|
| `filot/jwt-secret` | JWT_SECRET |
| `filot/session-secret` | SESSION_SECRET |
| `filot/service-internal-key` | SERVICE_INTERNAL_KEY |
| `filot/database-url` | DATABASE_URL |
| `filot/redis-url` | REDIS_URL |
| `filot/redis-password` | REDIS_PASSWORD |
| `filot/cf-r2-endpoint` | CF_R2_ENDPOINT |
| `filot/cf-r2-access-key` | CF_R2_ACCESS_KEY_ID |
| `filot/cf-r2-secret-key` | CF_R2_SECRET_ACCESS_KEY |
| `filot/cf-r2-bucket` | CF_R2_BUCKET_NAME |
| `filot/buli2-api-url` | BULI2_API_URL |
| `filot/buli2-api-key` | BULI2_API_KEY |
| `filot/buli2-callback-url` | BULI2_CALLBACK_URL |
| `filot/buli2-signature-secret` | BULI2_SIGNATURE_SECRET |
| `filot/temporal-api-key` | TEMPORAL_API_KEY |
| `filot/temporal-endpoint` | TEMPORAL_ENDPOINT |
| `filot/temporal-namespace` | TEMPORAL_NAMESPACE |

**IMPORTANT - IAM Permissions Required**:

ECS task definitions reference secrets by name (without the random suffix). The `ecsTaskExecutionRole` **must** have the following IAM policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "secretsmanager:GetSecretValue",
            "Resource": "arn:aws:secretsmanager:ap-southeast-2:070017891928:secret:filot/*"
        }
    ]
}
```

**Verify IAM role has wildcard permissions:**
```bash
aws iam get-role-policy --role-name ecsTaskExecutionRole --policy-name SecretsManagerAccess

# Or attach managed policy
aws iam put-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-name FilotSecretsAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:ap-southeast-2:070017891928:secret:filot/*"
    }]
  }'
```

**Verify secrets exist:**
```bash
aws secretsmanager get-secret-value --secret-id filot/jwt-secret --region ap-southeast-2
aws secretsmanager get-secret-value --secret-id filot/database-url --region ap-southeast-2
```

**Alternative - Use full ARNs with suffix**: If you prefer explicit secret references, get full ARNs and update task definitions:
```bash
# Get full ARN with suffix
aws secretsmanager describe-secret --secret-id filot/jwt-secret --query 'ARN' --output text
# Returns: arn:aws:secretsmanager:ap-southeast-2:070017891928:secret:filot/jwt-secret-AbCdEf

# Then update infra/ecs/filot-backend-task.json with full ARN
```

### 2. ECR Repositories

| Repository | Purpose |
|------------|---------|
| `filot-backend` | Backend API image |
| `filot-ocr-gpu-worker` | GPU OCR Worker image |

**Verify:**
```bash
aws ecr describe-repositories --repository-names filot-backend filot-ocr-gpu-worker --region ap-southeast-2
```

### 3. ECS Clusters

| Cluster | Launch Type | Purpose |
|---------|-------------|---------|
| `filot-backend-cluster` | Fargate | Backend API |
| `filot-ocr-gpu-cluster` | EC2 | GPU OCR Worker |

**Verify:**
```bash
aws ecs describe-clusters --clusters filot-backend-cluster filot-ocr-gpu-cluster --region ap-southeast-2
```

### 4. GPU Infrastructure

- Auto Scaling Group: `filot-ocr-gpu-asg`
- Launch Template: `filot-ocr-gpu-template`
- Instance Type: g5.xlarge
- Instance Profile: `ecsInstanceRole`

**Verify:**
```bash
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names filot-ocr-gpu-asg --region ap-southeast-2
```

### 5. CI/CD Requirements

- AWS CLI v2 installed
- Docker installed
- jq installed
- IAM credentials with permissions for: ECR, ECS, EC2, ASG, Secrets Manager, CloudWatch

---

## Pre-Deployment Checklist

- [ ] All secrets verified in AWS Secrets Manager
- [ ] ECR repositories exist
- [ ] ECS clusters are active
- [ ] GPU ASG has at least 1 healthy instance
- [ ] ALB and target groups configured
- [ ] CloudWatch log groups exist (or will be auto-created)
- [ ] Database migrations prepared
- [ ] Rollback plan reviewed
- [ ] Team notified of deployment window

---

## Deployment Steps

### Phase 1: Build & Push Images

#### Backend API

```bash
# Build
./scripts/deploy-backend.sh build

# Push to ECR
./scripts/deploy-backend.sh push
```

#### GPU OCR Worker

```bash
# Build
./scripts/deploy-ocr-gpu.sh build

# Push to ECR
./scripts/deploy-ocr-gpu.sh push
```

### Phase 2: Run Database Migrations

```bash
# Option 1: Via ECS run-task
./scripts/deploy-backend.sh migrate

# Option 2: Direct (if you have DB access)
docker run --env-file prod.env --rm \
  070017891928.dkr.ecr.ap-southeast-2.amazonaws.com/filot-backend:latest \
  npm run db:push
```

**Verify migrations:**
- Check CloudWatch logs for migration output
- Verify tables exist: `users`, `profiles`, `documents`, `manual_reviews`

### Phase 3: Deploy Backend (Fargate)

```bash
# Register task definition
./scripts/deploy-backend.sh register

# Update service
./scripts/deploy-backend.sh update
```

**Or all at once:**
```bash
./scripts/deploy-backend.sh all
```

### Phase 4: Deploy GPU OCR Worker (EC2)

```bash
# Register task definition
./scripts/deploy-ocr-gpu.sh register

# Update service
./scripts/deploy-ocr-gpu.sh update
```

**Or all at once:**
```bash
./scripts/deploy-ocr-gpu.sh all
```

### Phase 5: Wait for Stabilization

```bash
# Wait for backend service
aws ecs wait services-stable \
  --cluster filot-backend-cluster \
  --services filot-backend-service \
  --region ap-southeast-2

# Wait for GPU service
aws ecs wait services-stable \
  --cluster filot-ocr-gpu-cluster \
  --services filot-ocr-gpu-service \
  --region ap-southeast-2
```

---

## Post-Deployment Validation

### Run Smoke Tests

```bash
./scripts/smoke/run_e2e_smoke.sh --api-url https://api.filot.id
```

### Manual Validation Checklist

#### 1. API Health Check
```bash
curl https://api.filot.id/health
# Expected: {"ok":true,"redisConnected":true,...}
```

#### 2. Redis Queue Check
```bash
# Check GPU queue length
redis-cli -h <redis-host> LLEN filot:ocr:gpu:queue
```

#### 3. CloudWatch Logs
```bash
# View backend logs
aws logs tail /ecs/filot-backend --follow --region ap-southeast-2

# View GPU worker logs
aws logs tail /ecs/filot-ocr-gpu-worker --follow --region ap-southeast-2
```

#### 4. GPU Worker Validation
- Check container logs show "GPU detected"
- Verify `nvidia-smi` output in logs
- Confirm worker connected to Redis

#### 5. End-to-End Test
1. Upload a KTP document via API
2. Verify document appears in Redis queue
3. Verify GPU worker processes the job
4. Verify result published to Redis
5. Verify AI scoring applied
6. Verify BULI2 escalation (if score 35-85)

---

## Rollback Procedures

### Backend Rollback

```bash
# Quick rollback to previous revision
./scripts/deploy-backend.sh rollback

# Manual rollback to specific revision
aws ecs update-service \
  --cluster filot-backend-cluster \
  --service filot-backend-service \
  --task-definition filot-backend-task:<REVISION_NUMBER> \
  --region ap-southeast-2
```

### GPU Worker Rollback

```bash
# Scale down to 0
aws ecs update-service \
  --cluster filot-ocr-gpu-cluster \
  --service filot-ocr-gpu-service \
  --desired-count 0 \
  --region ap-southeast-2

# Re-tag previous image as latest
aws ecr batch-get-image \
  --repository-name filot-ocr-gpu-worker \
  --image-ids imageTag=<PREVIOUS_TAG> \
  --region ap-southeast-2

# Deploy with previous tag
IMAGE_TAG=<PREVIOUS_TAG> ./scripts/deploy-ocr-gpu.sh update
```

### Database Rollback

If migrations fail:
1. Connect to database
2. Run rollback SQL (if available)
3. Or restore from checkpoint

---

## Troubleshooting

### Backend Not Starting

**Symptoms**: Tasks keep restarting, health checks failing

**Steps**:
1. Check CloudWatch logs:
   ```bash
   aws logs tail /ecs/filot-backend --since 5m --region ap-southeast-2
   ```
2. Verify secrets are accessible:
   ```bash
   aws secretsmanager get-secret-value --secret-id filot/production/database-url
   ```
3. Check security groups allow outbound to Redis/DB

### GPU Worker Not Processing Jobs

**Symptoms**: Jobs stuck in queue, worker not consuming

**Steps**:
1. Check GPU worker logs:
   ```bash
   aws logs tail /ecs/filot-ocr-gpu-worker --since 5m --region ap-southeast-2
   ```
2. Verify GPU detected:
   ```bash
   # Should see nvidia-smi output in logs
   ```
3. Check Redis connectivity from worker
4. Verify queue key matches: `filot:ocr:gpu:queue`

### Requeue Stuck Jobs

```bash
./scripts/ops/requeue_stuck_jobs.sh --redis-url $REDIS_URL
```

### Increase GPU Capacity

```bash
# Scale ASG
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name filot-ocr-gpu-asg \
  --desired-capacity 2 \
  --region ap-southeast-2

# Scale ECS service
aws ecs update-service \
  --cluster filot-ocr-gpu-cluster \
  --service filot-ocr-gpu-service \
  --desired-count 2 \
  --region ap-southeast-2
```

### Health Check Failing

**Check**:
1. Container port is 8080
2. Health check path is `/health`
3. Application starts within 60 seconds (startPeriod)

---

## Operations Guide

### Scaling Backend

```bash
# Scale to 3 tasks
aws ecs update-service \
  --cluster filot-backend-cluster \
  --service filot-backend-service \
  --desired-count 3 \
  --region ap-southeast-2
```

### Viewing Logs

```bash
# Real-time logs
aws logs tail /ecs/filot-backend --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/filot-backend \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000
```

### Drain GPU Node

```bash
# Set instance to DRAINING
aws ecs update-container-instances-state \
  --cluster filot-ocr-gpu-cluster \
  --container-instances <INSTANCE_ARN> \
  --status DRAINING \
  --region ap-southeast-2
```

### Force New Deployment

```bash
aws ecs update-service \
  --cluster filot-backend-cluster \
  --service filot-backend-service \
  --force-new-deployment \
  --region ap-southeast-2
```

---

## CloudWatch Alarms Setup

Before deploying alarms, update the placeholder values in `alerts/cloudwatch-alarms.json`:

### Required Placeholder Substitutions

| Placeholder | Description | How to Find |
|-------------|-------------|-------------|
| `REPLACE_TG_ID` | Target Group ID | `aws elbv2 describe-target-groups --names filot-backend-tg --query 'TargetGroups[0].TargetGroupArn'` |
| `REPLACE_ALB_ID` | ALB ID suffix | `aws elbv2 describe-load-balancers --names filot-alb --query 'LoadBalancers[0].LoadBalancerArn'` |

### Deploy Alarms

```bash
# Replace placeholders first
sed -i 's/REPLACE_TG_ID/actual-tg-id/g' alerts/cloudwatch-alarms.json
sed -i 's/REPLACE_ALB_ID/actual-alb-id/g' alerts/cloudwatch-alarms.json

# Create CloudFormation stack
aws cloudformation create-stack \
  --stack-name filot-alarms \
  --template-body file://alerts/cloudwatch-alarms.json \
  --parameters ParameterKey=SNSTopicArn,ParameterValue=arn:aws:sns:ap-southeast-2:070017891928:filot-alerts \
  --region ap-southeast-2
```

---

## Contacts

| Role | Contact |
|------|---------|
| Backend Lead | [TBD] |
| DevOps | [TBD] |
| On-Call | [TBD] |

---

## Appendix

### CloudWatch Log Queries

**Find Errors**:
```
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 50
```

**OCR Processing Time**:
```
fields @timestamp, @message
| filter @message like /OCR completed/
| parse @message /processing_time_ms=(?<time>\d+)/
| stats avg(time), max(time), min(time)
```

### Useful AWS CLI Commands

```bash
# List running tasks
aws ecs list-tasks --cluster filot-backend-cluster --service-name filot-backend-service

# Describe task
aws ecs describe-tasks --cluster filot-backend-cluster --tasks <TASK_ARN>

# Execute command in container
aws ecs execute-command \
  --cluster filot-backend-cluster \
  --task <TASK_ARN> \
  --container filot-backend \
  --interactive \
  --command "/bin/sh"
```
