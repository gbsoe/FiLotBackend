# T6.B Backend Security & Domain Finalization Patch

**Date:** 2024

This document describes the security enhancements implemented in Tranche T6.B for the FiLot backend.

---

## 1. CORS Rules (Strict Cross-Origin Policy)

### Configuration

The backend enforces strict CORS (Cross-Origin Resource Sharing) policy:

**Production Mode:**
- Only `https://app.filot.id` is allowed as origin
- All other origins are blocked and logged

**Development Mode:**
- `https://app.filot.id` (primary)
- `http://localhost:3000` (React dev server)
- `http://localhost:19000` (Expo/React Native)

### Implementation

Located in: `src/middlewares/corsConfig.ts`

```typescript
const corsConfig = cors({
  origin: (origin, callback) => {
    // Validates origin against allowed list
    // Blocks and logs unauthorized origins
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-service-key"],
  credentials: true,
});
```

### Environment Variable

- `FILOT_FRONTEND_ORIGIN`: Primary frontend domain (default: `https://app.filot.id`)

---

## 2. Service-Key Protection (Internal API Security)

### Purpose

Service keys protect internal routes used for:
- FiLot ↔ Buli2 hybrid verification callbacks
- Admin internal routes
- System-to-system communication

### Implementation

Located in: `src/middlewares/verifyServiceKey.ts` and `src/middlewares/serviceKeyAuth.ts`

### Usage

Protected routes require the `x-service-key` header:

```http
GET /internal/some-endpoint
x-service-key: sk_live_...
```

### Environment Variable

- `SERVICE_INTERNAL_KEY`: 64-character secret key for service authentication

---

## 3. Signed URL Flow (R2 Presigned Downloads)

### Purpose

Prevents PII (Personally Identifiable Information) leakage by:
- Disabling public access to KTP/NPWP files
- Generating time-limited presigned download URLs
- Requiring authentication for document access

### Flow

1. User requests document via `/documents/secure-download/:id`
2. Backend verifies user authentication (JWT)
3. Backend checks document ownership (user can only access own documents)
4. Backend generates time-limited presigned URL from R2
5. Client receives URL and can download file within expiry window

### Endpoint

```http
GET /documents/secure-download/:documentId
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "url": "https://bucket.r2.cloudflarestorage.com/...?X-Amz-Signature=..."
}
```

### Security Features

- JWT authentication required
- Document ownership validation
- Time-limited URLs (default: 3600 seconds / 1 hour)
- URLs are single-use and cannot be shared indefinitely

### Environment Variable

- `R2_PRIVATE_URL_EXPIRY`: URL expiry time in seconds (default: 3600)

---

## 4. Rate Limiter Configuration

### Purpose

Prevents:
- Brute-force attacks
- Abusive uploads/processing
- DDoS mitigation

### Configuration

Located in: `src/middlewares/rateLimiter.ts`

**Global Rate Limit:**
- Window: 1 minute
- Max requests: 60 per IP
- Applied to all routes

**Sensitive Rate Limit:**
- Window: 1 minute
- Max requests: 10 per IP
- Applied to sensitive endpoints (auth, document processing)

### Response on Limit Exceeded

```json
{
  "error": "Too many requests, please try again later"
}
```

HTTP Status: 429 (Too Many Requests)

---

## 5. Security Test Instructions

### CORS Testing

```bash
# Should succeed (production frontend)
curl -H "Origin: https://app.filot.id" \
     -X OPTIONS \
     https://api.filot.id/health

# Should fail (unauthorized origin)
curl -H "Origin: https://malicious-site.com" \
     -X OPTIONS \
     https://api.filot.id/health
```

### Service Key Testing

```bash
# Should succeed (valid key)
curl -H "x-service-key: $SERVICE_INTERNAL_KEY" \
     https://api.filot.id/internal/reviews

# Should fail (missing key)
curl https://api.filot.id/internal/reviews
# Returns: 401 Unauthorized

# Should fail (invalid key)
curl -H "x-service-key: invalid-key" \
     https://api.filot.id/internal/reviews
# Returns: 401 Unauthorized
```

### Presigned URL Testing

```bash
# Get presigned URL (authenticated)
curl -H "Authorization: Bearer $JWT_TOKEN" \
     https://api.filot.id/documents/secure-download/<document-id>

# Response: { "url": "https://..." }

# Should fail (unauthenticated)
curl https://api.filot.id/documents/secure-download/<document-id>
# Returns: 401 Unauthorized

# Should fail (other user's document)
curl -H "Authorization: Bearer $OTHER_USER_TOKEN" \
     https://api.filot.id/documents/secure-download/<document-id>
# Returns: 403 Forbidden
```

### Rate Limiting Testing

```bash
# Send 65 requests quickly (should hit limit)
for i in {1..65}; do
  curl -s https://api.filot.id/health
done
# Last 5 should return 429 Too Many Requests
```

---

## 6. Environment Variables Summary

| Variable | Description | Example |
|----------|-------------|---------|
| `FILOT_FRONTEND_ORIGIN` | Allowed frontend domain | `https://app.filot.id` |
| `SERVICE_INTERNAL_KEY` | Internal service authentication key | `sk_live_abc123...` (64 chars) |
| `R2_PRIVATE_URL_EXPIRY` | Presigned URL expiry in seconds | `3600` |

---

## 7. Files Modified/Created

### New Files
- `src/middlewares/corsConfig.ts` - Strict CORS configuration
- `src/middlewares/verifyServiceKey.ts` - Service key validation
- `src/routes/downloadRoutes.ts` - Secure download endpoint

### Modified Files
- `src/app.ts` - Applied new middleware and routes
- `src/services/r2Storage.ts` - Added R2_PRIVATE_URL_EXPIRY support

### Existing (Unchanged)
- `src/middlewares/rateLimiter.ts` - Already configured
- `src/middlewares/serviceKeyAuth.ts` - Already implemented

---

## 8. Compatibility Notes

- Existing OCR and upload endpoints remain functional
- Hybrid verification architecture is preserved
- Frontend repository was NOT modified
- All changes are backward compatible
