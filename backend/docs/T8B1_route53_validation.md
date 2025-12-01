# T8-B.1 Route53 DNS Configuration & Validation

**Tranche**: T8-B.1  
**Date**: 2024-12-01  
**Status**: Configuration Ready

---

## Objective

Configure DNS records in Route53 (or external DNS provider) to route `api.filot.me` to the AWS Application Load Balancer.

---

## DNS Records Required

### A-Record (Alias) for API

| Property | Value |
|----------|-------|
| **Record Name** | `api.filot.me` |
| **Record Type** | A (Alias) |
| **Alias Target** | ALB DNS Name |
| **Alias Hosted Zone ID** | ALB Hosted Zone ID |
| **Routing Policy** | Simple |
| **Evaluate Target Health** | Yes |

### Example ALB DNS Name

```
filot-backend-alb-XXXXXXXXXX.ap-southeast-2.elb.amazonaws.com
```

---

## Route53 Configuration

### If Using Route53 Hosted Zone

#### Get ALB DNS Name

```bash
aws elbv2 describe-load-balancers \
  --names filot-backend-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --region ap-southeast-2
```

#### Get ALB Hosted Zone ID

```bash
aws elbv2 describe-load-balancers \
  --names filot-backend-alb \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' \
  --output text \
  --region ap-southeast-2
```

#### Create A-Record (Alias)

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0XXXXXXXXXX \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.filot.me",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z1GM3OXH4ZPM65",
          "DNSName": "dualstack.filot-backend-alb-XXXXXXXXXX.ap-southeast-2.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

---

## If Using External DNS Provider (Cloudflare, Namecheap, etc.)

### CNAME Record (Alternative)

If your DNS provider doesn't support ALIAS records at the zone apex:

| Property | Value |
|----------|-------|
| **Record Name** | `api` |
| **Record Type** | CNAME |
| **Value** | ALB DNS Name |
| **TTL** | 300 (5 minutes) |
| **Proxy Status** | DNS Only (not proxied) |

**Note**: CNAME records work for subdomains like `api.filot.me` but not for root domains.

---

## ACM Certificate Validation

Before the HTTPS endpoint works, the ACM certificate must be validated:

### Check Certificate Status

```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:ap-southeast-2:070017891928:certificate/XXXXXXXX \
  --query 'Certificate.Status' \
  --output text \
  --region ap-southeast-2
```

Expected output: `ISSUED`

### Get Validation CNAME Records

```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:ap-southeast-2:070017891928:certificate/XXXXXXXX \
  --query 'Certificate.DomainValidationOptions[*].ResourceRecord' \
  --output table \
  --region ap-southeast-2
```

### Add Validation Record

Add the CNAME record provided by ACM to your DNS:

```
Name:  _acm-validation.api.filot.me
Type:  CNAME
Value: _XXXXXXXXXXXXXXXX.acm-validations.aws.
```

---

## DNS Propagation Validation

### Using dig

```bash
# Check A record
dig api.filot.me A +short

# Check CNAME (if used)
dig api.filot.me CNAME +short

# Full query
dig api.filot.me ANY
```

### Using nslookup

```bash
nslookup api.filot.me
```

### Using curl

```bash
# Test HTTPS endpoint
curl -I https://api.filot.me/health

# Expected response:
# HTTP/2 200
# content-type: application/json
# ...
```

### Using Online Tools

- [DNS Checker](https://dnschecker.org/#A/api.filot.me)
- [MX Toolbox](https://mxtoolbox.com/SuperTool.aspx?action=a%3aapi.filot.me)
- [What's My DNS](https://www.whatsmydns.net/#A/api.filot.me)

---

## Validation Checklist

### DNS Records

- [ ] A-record (or CNAME) created for `api.filot.me`
- [ ] Record points to ALB DNS name
- [ ] DNS propagation complete (check with multiple tools)
- [ ] Resolves to correct ALB IP addresses

### ACM Certificate

- [ ] Certificate requested for `api.filot.me`
- [ ] Validation CNAME record added
- [ ] Certificate status is `ISSUED`
- [ ] Certificate attached to ALB HTTPS listener

### Connectivity Test

- [ ] `curl https://api.filot.me/health` returns 200 OK
- [ ] SSL certificate is valid (no browser warnings)
- [ ] Certificate shows correct domain: `api.filot.me`

---

## DNS Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         DNS FLOW                                  │
└──────────────────────────────────────────────────────────────────┘

User Request: https://api.filot.me/health
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                     DNS Resolution                                │
│                                                                   │
│   api.filot.me  ──────────────────────────────────────────────►  │
│        │                                                          │
│        ▼                                                          │
│   Route53 / External DNS                                          │
│        │                                                          │
│        ▼                                                          │
│   A-Record (Alias) or CNAME                                       │
│        │                                                          │
│        ▼                                                          │
│   filot-backend-alb-XXXXXX.ap-southeast-2.elb.amazonaws.com      │
│        │                                                          │
│        ▼                                                          │
│   ALB IP Addresses (multiple for HA)                              │
│   52.XX.XX.XX, 54.XX.XX.XX                                        │
└──────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                Application Load Balancer                          │
│                                                                   │
│   • TLS Termination (ACM Certificate)                             │
│   • Routes to ECS Fargate Tasks                                   │
│   • Health Checks on /health                                      │
└──────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ECS Fargate                                    │
│                                                                   │
│   filot-backend-service                                           │
│   Port: 8080                                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### DNS Not Resolving

1. Check if record was created correctly
2. Wait for TTL to expire (up to 48 hours for new records)
3. Try different DNS resolvers (8.8.8.8, 1.1.1.1)

### Certificate Not Valid

1. Verify ACM validation record is correct
2. Check certificate status in ACM console
3. Ensure certificate is attached to ALB listener

### Connection Refused

1. Verify ALB security group allows 443 inbound
2. Check ECS service is running healthy tasks
3. Verify target group health checks pass

---

## DNS Status Report

| Domain | Record Type | Target | Status |
|--------|-------------|--------|--------|
| `api.filot.me` | A (Alias) / CNAME | ALB DNS | PENDING |
| `app.filot.me` | A / CNAME | Frontend hosting | PENDING |

**Note**: Update this table after DNS configuration is complete.

---

*Generated as part of Tranche T8-B.1: Backend Deployment Patch*
