# T8-B.1 BULI2 Callback Endpoints Validation

**Tranche**: T8-B.1  
**Date**: 2024-12-01  
**Status**: Ready for Production

---

## Objective

Validate that BULI2 callback endpoints are properly exposed and functional via the production deployment at `https://api.filot.me`.

---

## BULI2 Integration Endpoints

### Endpoint Summary

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/internal/buli2/callback` | Primary callback for review decisions | Service Key |
| POST | `/internal/buli2/callback/backup` | Backup callback endpoint | Service Key |
| GET | `/internal/buli2/health` | Health check for BULI2 integration | Service Key |
| GET | `/internal/buli2/status/{id}` | Check status of a specific review | Service Key |

### Production URLs

```
POST https://api.filot.me/internal/buli2/callback
POST https://api.filot.me/internal/buli2/callback/backup
GET  https://api.filot.me/internal/buli2/health
GET  https://api.filot.me/internal/buli2/status/{id}
```

---

## Endpoint Specifications

### 1. Primary Callback Endpoint

**Endpoint**: `POST /internal/buli2/callback`

**Purpose**: Receives manual review decisions from BULI2 system

**Request Headers**:
```
Content-Type: application/json
x-service-key: <SERVICE_INTERNAL_KEY>
x-buli2-signature: <HMAC-SHA256 signature>
```

**Request Body**:
```json
{
  "reviewId": "uuid-review-id",
  "documentId": "uuid-document-id",
  "decision": "approved" | "rejected",
  "reviewerNotes": "Optional reviewer notes",
  "timestamp": "2024-12-01T00:00:00Z"
}
```

**Success Response**: `200 OK`
```json
{
  "status": "success",
  "message": "Review decision processed",
  "documentId": "uuid-document-id"
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid service key
- `400 Bad Request`: Invalid payload or signature
- `404 Not Found`: Document not found
- `500 Internal Server Error`: Processing error

---

### 2. Backup Callback Endpoint

**Endpoint**: `POST /internal/buli2/callback/backup`

**Purpose**: Fallback endpoint for callback delivery (same spec as primary)

**Usage**: BULI2 should configure this as a secondary callback URL for reliability.

---

### 3. Health Check Endpoint

**Endpoint**: `GET /internal/buli2/health`

**Purpose**: Verify BULI2 integration is operational

**Request Headers**:
```
x-service-key: <SERVICE_INTERNAL_KEY>
```

**Success Response**: `200 OK`
```json
{
  "status": "healthy",
  "buli2": {
    "configured": true,
    "api_url": "https://buli2.internal.filot.me",
    "callback_url": "https://api.filot.me/internal/buli2/callback",
    "signature_secret": "configured"
  },
  "timestamp": "2024-12-01T00:00:00Z"
}
```

---

### 4. Status Check Endpoint

**Endpoint**: `GET /internal/buli2/status/{id}`

**Purpose**: Check the status of a specific document review

**Path Parameters**:
- `id`: Document ID or Review ID

**Success Response**: `200 OK`
```json
{
  "documentId": "uuid-document-id",
  "status": "pending_review" | "approved" | "rejected",
  "buli2TicketId": "buli2-ticket-id",
  "escalatedAt": "2024-12-01T00:00:00Z",
  "resolvedAt": null,
  "reviewerNotes": null
}
```

---

## Signature Verification

### HMAC-SHA256 Signature

BULI2 callbacks include a signature header for authenticity verification:

```
x-buli2-signature: sha256=<hex-encoded-signature>
```

### Signature Calculation

```javascript
const crypto = require('crypto');

const signature = crypto
  .createHmac('sha256', BULI2_SIGNATURE_SECRET)
  .update(JSON.stringify(requestBody))
  .digest('hex');

// Header value: sha256=<signature>
```

### Verification in FiLot Backend

The backend validates the signature before processing:

```typescript
const isValidSignature = verifyBuli2Signature(
  req.headers['x-buli2-signature'],
  req.body,
  process.env.BULI2_SIGNATURE_SECRET
);

if (!isValidSignature) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BULI2_API_URL` | BULI2 service endpoint | Yes |
| `BULI2_API_KEY` | API key for outbound calls | Yes |
| `BULI2_CALLBACK_URL` | Callback URL (self-reference) | Yes |
| `BULI2_SIGNATURE_SECRET` | HMAC secret for signature verification | Yes |
| `SERVICE_INTERNAL_KEY` | Service key for internal routes | Yes |

### Production Values

```bash
BULI2_CALLBACK_URL=https://api.filot.me/internal/buli2/callback
```

---

## Validation Tests

### Test 1: Health Check

```bash
curl -X GET "https://api.filot.me/internal/buli2/health" \
  -H "x-service-key: $SERVICE_INTERNAL_KEY"

# Expected: 200 OK with health status
```

### Test 2: Callback with Valid Signature

```bash
# Calculate signature
BODY='{"reviewId":"test-123","documentId":"doc-456","decision":"approved"}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$BULI2_SIGNATURE_SECRET" | awk '{print $2}')

curl -X POST "https://api.filot.me/internal/buli2/callback" \
  -H "Content-Type: application/json" \
  -H "x-service-key: $SERVICE_INTERNAL_KEY" \
  -H "x-buli2-signature: sha256=$SIGNATURE" \
  -d "$BODY"

# Expected: 200 OK (or 404 if document doesn't exist)
```

### Test 3: Callback with Invalid Signature

```bash
curl -X POST "https://api.filot.me/internal/buli2/callback" \
  -H "Content-Type: application/json" \
  -H "x-service-key: $SERVICE_INTERNAL_KEY" \
  -H "x-buli2-signature: sha256=invalid-signature" \
  -d '{"reviewId":"test","documentId":"test","decision":"approved"}'

# Expected: 401 Unauthorized
```

### Test 4: Missing Service Key

```bash
curl -X GET "https://api.filot.me/internal/buli2/health"

# Expected: 401 Unauthorized
```

---

## Validation Checklist

### Configuration

- [ ] `BULI2_API_URL` configured in AWS Secrets Manager
- [ ] `BULI2_API_KEY` configured in AWS Secrets Manager
- [ ] `BULI2_CALLBACK_URL` set to `https://api.filot.me/internal/buli2/callback`
- [ ] `BULI2_SIGNATURE_SECRET` shared between FiLot and BULI2

### Endpoint Tests

- [ ] Health check returns 200 OK with valid service key
- [ ] Health check returns 401 with missing/invalid service key
- [ ] Callback accepts valid signature
- [ ] Callback rejects invalid signature
- [ ] Status endpoint returns document review status

### Integration Tests

- [ ] BULI2 can successfully POST to callback endpoint
- [ ] Signature verification works end-to-end
- [ ] Database updates correctly on callback

---

## Security Considerations

1. **Service Key Protection**: All internal endpoints require `x-service-key` header
2. **Signature Verification**: Callbacks require valid HMAC-SHA256 signature
3. **TLS Only**: All traffic must be over HTTPS
4. **No Public Access**: Internal routes are not accessible without authentication

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BULI2 Integration Flow                            │
└─────────────────────────────────────────────────────────────────────────┘

    FiLot Backend                                        BULI2 Service
    ─────────────                                        ─────────────

    ┌─────────────────┐                            ┌─────────────────┐
    │ Document needs  │                            │                 │
    │ manual review   │────── HTTP POST ──────────►│ BULI2 API       │
    │ (score 35-85)   │       (escalation)         │ Create Review   │
    └─────────────────┘                            └────────┬────────┘
                                                            │
                                                            │ Human Review
                                                            │
    ┌─────────────────┐                            ┌────────▼────────┐
    │ Callback        │◄───── HTTP POST ───────────│ BULI2           │
    │ /internal/buli2 │       (decision)           │ Send Decision   │
    │ /callback       │       + signature          │                 │
    └────────┬────────┘                            └─────────────────┘
             │
             │ Verify signature
             │ Update document
             │
    ┌────────▼────────┐
    │ Document        │
    │ verification_   │
    │ status updated  │
    └─────────────────┘
```

---

*Generated as part of Tranche T8-B.1: Backend Deployment Patch*
