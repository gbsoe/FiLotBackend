# T8-A: Production Secrets Overview

**Tranche:** T8-A  
**Generated:** 2024-11-30

---

## 1. Secrets Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Secrets Manager                          │
├─────────────────────────────────────────────────────────────────┤
│  filot/production/                                              │
│  ├── jwt-secret              → JWT_SECRET                       │
│  ├── session-secret          → SESSION_SECRET                   │
│  ├── service-internal-key    → SERVICE_INTERNAL_KEY             │
│  ├── database-url            → DATABASE_URL                     │
│  ├── stack-auth              → STACK_PROJECT_ID                 │
│  │                           → STACK_SECRET_SERVER_KEY          │
│  │                           → STACK_PUBLISHABLE_CLIENT_KEY     │
│  ├── cloudflare-r2           → CF_ACCOUNT_ID                    │
│  │                           → CF_R2_ENDPOINT                   │
│  │                           → CF_R2_ACCESS_KEY_ID              │
│  │                           → CF_R2_SECRET_ACCESS_KEY          │
│  │                           → CF_R2_BUCKET_NAME                │
│  ├── redis                   → REDIS_URL                        │
│  │                           → REDIS_PASSWORD                   │
│  ├── buli2                   → BULI2_API_KEY                    │
│  │                           → BULI2_SIGNATURE_SECRET           │
│  └── temporal                → TEMPORAL_API_KEY                 │
│                              → TEMPORAL_ENDPOINT                │
│                              → TEMPORAL_NAMESPACE               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Secret Categories

### Critical Secrets (Must Never Be Exposed)

| Secret | Purpose | Rotation Policy |
|--------|---------|-----------------|
| `JWT_SECRET` | Signs authentication tokens | Yearly |
| `SESSION_SECRET` | Encrypts session data | Yearly |
| `DATABASE_URL` | Database access | On compromise |
| `CF_R2_SECRET_ACCESS_KEY` | R2 storage access | Yearly |
| `REDIS_PASSWORD` | Redis authentication | Yearly |
| `BULI2_API_KEY` | External API access | As required |
| `TEMPORAL_API_KEY` | Workflow orchestration | Yearly |
| `BULI2_SIGNATURE_SECRET` | Callback verification | As required |

### Configuration Secrets (Less Sensitive)

| Secret | Purpose | Notes |
|--------|---------|-------|
| `STACK_PROJECT_ID` | Auth provider ID | Public identifier |
| `CF_ACCOUNT_ID` | Cloudflare account | Semi-public |
| `CF_R2_ENDPOINT` | Storage endpoint | Derived from account |
| `CF_R2_BUCKET_NAME` | Bucket name | Internal knowledge |

---

## 3. Current Status

### Existing Secrets (Verified)

- ✅ `DATABASE_URL`
- ✅ `SESSION_SECRET`
- ✅ `SERVICE_INTERNAL_KEY`
- ✅ `STACK_PROJECT_ID`
- ✅ `STACK_SECRET_SERVER_KEY`
- ✅ `STACK_PUBLISHABLE_CLIENT_KEY`
- ✅ `CF_ACCOUNT_ID`
- ✅ `CF_R2_ENDPOINT`
- ✅ `CF_R2_ACCESS_KEY_ID`
- ✅ `CF_R2_SECRET_ACCESS_KEY`
- ✅ `CF_R2_BUCKET_NAME`
- ✅ `REDIS_URL`
- ✅ `REDIS_PASSWORD`
- ✅ `REDIS_HOST`
- ✅ `REDIS_PORT`
- ✅ `REDIS_USERNAME`
- ✅ `REDIS_TLS`
- ✅ `TEMPORAL_API_KEY`
- ✅ `TEMPORAL_ENDPOINT`
- ✅ `TEMPORAL_NAMESPACE`

### Missing Secrets (Action Required)

- ❌ `JWT_SECRET` - Generate secure random string (32+ chars)
- ❌ `BULI2_API_KEY` - Obtain from BULI2 service team
- ❌ `BULI2_SIGNATURE_SECRET` - Generate and share with BULI2 team

---

## 4. ECS Task Definition Integration

### Secrets from AWS Secrets Manager

```json
{
  "containerDefinitions": [{
    "secrets": [
      {
        "name": "DATABASE_URL",
        "valueFrom": "arn:aws:secretsmanager:ap-southeast-2:ACCOUNT_ID:secret:filot/production/database-url"
      },
      {
        "name": "JWT_SECRET",
        "valueFrom": "arn:aws:secretsmanager:ap-southeast-2:ACCOUNT_ID:secret:filot/production/jwt-secret"
      },
      {
        "name": "REDIS_URL",
        "valueFrom": "arn:aws:secretsmanager:ap-southeast-2:ACCOUNT_ID:secret:filot/production/redis:url::"
      },
      {
        "name": "CF_R2_SECRET_ACCESS_KEY",
        "valueFrom": "arn:aws:secretsmanager:ap-southeast-2:ACCOUNT_ID:secret:filot/production/cloudflare-r2:secretKey::"
      }
    ]
  }]
}
```

---

## 5. Secret Generation Guidelines

### JWT_SECRET

```bash
# Generate 64-character random secret
openssl rand -base64 48
```

### SESSION_SECRET

```bash
# Generate 32-character random secret
openssl rand -hex 32
```

### BULI2_SIGNATURE_SECRET

```bash
# Generate HMAC-compatible secret
openssl rand -base64 32
```

---

## 6. Validation Script

```bash
#!/bin/bash
# validate-secrets.sh

REQUIRED_SECRETS=(
  "JWT_SECRET"
  "SESSION_SECRET"
  "SERVICE_INTERNAL_KEY"
  "DATABASE_URL"
  "STACK_PROJECT_ID"
  "STACK_SECRET_SERVER_KEY"
  "CF_R2_ENDPOINT"
  "CF_R2_ACCESS_KEY_ID"
  "CF_R2_SECRET_ACCESS_KEY"
  "CF_R2_BUCKET_NAME"
  "REDIS_URL"
  "BULI2_API_KEY"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
  if [ -z "${!secret}" ]; then
    echo "MISSING: $secret"
  else
    echo "OK: $secret"
  fi
done
```

---

## 7. Security Best Practices

1. **Never log secrets** - Use masked logging for any secret values
2. **Rotate regularly** - Annual rotation for long-lived secrets
3. **Limit access** - IAM policies for secret access
4. **Audit access** - Enable CloudTrail for secret access logs
5. **Separate environments** - Different secrets for dev/staging/prod

---

*Generated as part of Tranche T8-A: Production Deployment Preparation*
