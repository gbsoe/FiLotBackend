# T8-B.1 Application Load Balancer Configuration Summary

**Tranche**: T8-B.1  
**Date**: 2024-12-01  
**Status**: Configuration Ready

---

## Overview

This document describes the Application Load Balancer (ALB) configuration for exposing the FiLot Backend API at `https://api.filot.me`.

---

## ALB Configuration

### Load Balancer Details

| Property | Value |
|----------|-------|
| **Name** | `filot-backend-alb` |
| **Scheme** | internet-facing |
| **Type** | application |
| **IP Address Type** | ipv4 |
| **Region** | ap-southeast-2 |

### Subnets

The ALB should be deployed across at least 2 Availability Zones:
- `ap-southeast-2a`
- `ap-southeast-2b`

---

## Security Groups

### ALB Security Group (`filot-alb-sg`)

| Direction | Port | Protocol | Source | Description |
|-----------|------|----------|--------|-------------|
| Inbound | 80 | TCP | 0.0.0.0/0 | HTTP (redirect to HTTPS) |
| Inbound | 443 | TCP | 0.0.0.0/0 | HTTPS |
| Outbound | 8080 | TCP | Backend SG | To backend containers |

### Backend Security Group (`filot-backend-sg`)

| Direction | Port | Protocol | Source | Description |
|-----------|------|----------|--------|-------------|
| Inbound | 8080 | TCP | ALB SG | From ALB only |
| Outbound | 443 | TCP | 0.0.0.0/0 | To external services |
| Outbound | 5432 | TCP | 0.0.0.0/0 | To PostgreSQL (Neon) |
| Outbound | 6379 | TCP | 0.0.0.0/0 | To Redis (Upstash) |

---

## ACM Certificate

### Certificate Details

| Property | Value |
|----------|-------|
| **Domain Name** | `api.filot.me` |
| **Alternative Names** | `*.filot.me` (optional) |
| **Validation Method** | DNS |
| **Region** | ap-southeast-2 |

### Certificate Request Command

```bash
aws acm request-certificate \
  --domain-name api.filot.me \
  --validation-method DNS \
  --region ap-southeast-2
```

### DNS Validation

After requesting the certificate, add the CNAME record provided by ACM to your DNS:

```
_acm-validation.api.filot.me → <acm-validation-record>.acm-validations.aws
```

---

## Listener Configuration

### HTTP Listener (Port 80)

**Action**: Redirect to HTTPS

```json
{
  "Type": "redirect",
  "RedirectConfig": {
    "Protocol": "HTTPS",
    "Port": "443",
    "StatusCode": "HTTP_301"
  }
}
```

### HTTPS Listener (Port 443)

**Action**: Forward to Target Group

```json
{
  "Type": "forward",
  "TargetGroupArn": "arn:aws:elasticloadbalancing:ap-southeast-2:070017891928:targetgroup/filot-backend-tg/..."
}
```

**SSL Policy**: `ELBSecurityPolicy-TLS13-1-2-2021-06`

---

## Target Group Configuration

### Target Group Details

| Property | Value |
|----------|-------|
| **Name** | `filot-backend-tg` |
| **Target Type** | ip |
| **Protocol** | HTTP |
| **Port** | 8080 |
| **VPC** | Default or FiLot VPC |

### Health Check Configuration

| Property | Value |
|----------|-------|
| **Protocol** | HTTP |
| **Path** | `/health` |
| **Port** | traffic-port (8080) |
| **Healthy Threshold** | 2 |
| **Unhealthy Threshold** | 3 |
| **Timeout** | 5 seconds |
| **Interval** | 30 seconds |
| **Success Codes** | 200 |

---

## Architecture Diagram

```
                         ┌─────────────────────────────────┐
                         │           Internet               │
                         └───────────────┬─────────────────┘
                                         │
                         ┌───────────────▼─────────────────┐
                         │      Route53 DNS                 │
                         │   api.filot.me → ALB DNS         │
                         └───────────────┬─────────────────┘
                                         │
                         ┌───────────────▼─────────────────┐
                         │   Application Load Balancer      │
                         │      filot-backend-alb           │
                         │                                  │
                         │   ┌───────────┐  ┌───────────┐  │
                         │   │  :80      │  │  :443     │  │
                         │   │  Redirect │  │  Forward  │  │
                         │   │  → 443    │  │  → TG     │  │
                         │   └───────────┘  └─────┬─────┘  │
                         │                        │        │
                         │   ACM Certificate:     │        │
                         │   api.filot.me         │        │
                         └────────────────────────┼────────┘
                                                  │
                         ┌────────────────────────▼────────┐
                         │     Target Group                 │
                         │     filot-backend-tg             │
                         │                                  │
                         │   Health Check: GET /health      │
                         │   Port: 8080                     │
                         └──────────┬───────────┬──────────┘
                                    │           │
                    ┌───────────────▼──┐    ┌───▼───────────────┐
                    │   ECS Task 1     │    │   ECS Task 2      │
                    │   (Fargate)      │    │   (Fargate)       │
                    │   Port: 8080     │    │   Port: 8080      │
                    └──────────────────┘    └───────────────────┘
```

---

## AWS CLI Commands

### Create Target Group

```bash
aws elbv2 create-target-group \
  --name filot-backend-tg \
  --protocol HTTP \
  --port 8080 \
  --vpc-id vpc-XXXXXXXX \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region ap-southeast-2
```

### Create Load Balancer

```bash
aws elbv2 create-load-balancer \
  --name filot-backend-alb \
  --subnets subnet-AAAAAAAA subnet-BBBBBBBB \
  --security-groups sg-alb-XXXXXXXX \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region ap-southeast-2
```

### Create HTTPS Listener

```bash
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:ap-southeast-2:070017891928:loadbalancer/app/filot-backend-alb/... \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:ap-southeast-2:070017891928:certificate/... \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:ap-southeast-2:070017891928:targetgroup/filot-backend-tg/... \
  --region ap-southeast-2
```

### Create HTTP Redirect Listener

```bash
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:ap-southeast-2:070017891928:loadbalancer/app/filot-backend-alb/... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
  --region ap-southeast-2
```

---

## Verification Checklist

- [ ] ACM certificate requested for `api.filot.me`
- [ ] DNS validation record added
- [ ] Certificate issued (status: ISSUED)
- [ ] ALB created in correct subnets
- [ ] Security groups configured correctly
- [ ] Target group created with health check on `/health`
- [ ] HTTPS listener configured with certificate
- [ ] HTTP listener redirects to HTTPS
- [ ] ECS service linked to target group
- [ ] Route53 A-record pointing to ALB

---

*Generated as part of Tranche T8-B.1: Backend Deployment Patch*
