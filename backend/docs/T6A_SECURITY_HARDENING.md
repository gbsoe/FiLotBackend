# T6.A Security Hardening Patch

## Overview
This document covers the implementation of Tranche T6.A - Security Hardening Patch for the FiLot Backend.

## Implementation Date
November 26, 2025

---

## Changes Summary

### 1. R2 Storage: Private + Presigned URLs

**Modified Files:**
- `backend/src/services/r2Storage.ts`

**Changes:**
- Removed public URL generation from `uploadToR2()`
- Now returns only the R2 object key (not a public URL)
- Added `generatePresignedUrl(key, expiresSeconds)` function using AWS S3 presigner
- Added `extractKeyFromUrl()` helper to extract keys from legacy URLs
- Default presigned URL expiry: 5 minutes (300 seconds)

### 2. Document Download Route

**New Route:**
- `GET /documents/:id/download`

**Behavior:**
- Validates user authentication
- Validates user owns the document
- Generates a 5-minute presigned URL
- Returns `{ url: "<signed>", expiresIn: 300 }`

**Modified Files:**
- `backend/src/controllers/documentsController.ts`
- `backend/src/routes/documentsRoutes.ts`

### 3. Rate Limiting

**New File:**
- `backend/src/middlewares/rateLimiter.ts`

**Global Limiter:**
- 60 requests/minute per IP
- Applied to all routes

**Sensitive Limiter:**
- 10 requests/minute per IP
- Applied to:
  - `POST /documents/upload`
  - `POST /documents/:id/process`
  - `POST /verification/evaluate`
  - `POST /verification/:documentId/escalate`
  - All `/internal/*` routes

### 4. CORS Hardening

**Modified File:**
- `backend/src/app.ts`

**Allowed Origins:**
- `process.env.FILOT_FRONTEND_ORIGIN`
- `http://localhost:3000`
- `http://localhost:19000`

**Allowed Methods:**
- GET, POST, PUT, DELETE only

**Allowed Headers:**
- Content-Type, Authorization, x-service-key

### 5. Internal Routes Security

**New File:**
- `backend/src/middlewares/serviceKeyAuth.ts`

**Behavior:**
- All `/internal/*` routes require header: `x-service-key`
- Compared against `process.env.SERVICE_INTERNAL_KEY`
- Returns 401 if missing or invalid
- Service key is never logged

### 6. File Validation Before Upload

**New File:**
- `backend/src/utils/fileValidation.ts`

**Validation Checks:**
- Magic-number detection for JPEG, PNG, PDF
- MIME type validation and cross-check
- Maximum file size: 5MB
- Rejects files before R2 upload and DB insert

---

## Modified Files List

### New Files Created:
1. `backend/src/utils/fileValidation.ts`
2. `backend/src/middlewares/rateLimiter.ts`
3. `backend/src/middlewares/serviceKeyAuth.ts`
4. `backend/docs/T6A_SECURITY_HARDENING.md`

### Modified Files:
1. `backend/src/services/r2Storage.ts`
2. `backend/src/controllers/documentsController.ts`
3. `backend/src/routes/documentsRoutes.ts`
4. `backend/src/routes/documentProcessRoutes.ts`
5. `backend/src/routes/verificationRoutes.ts`
6. `backend/src/routes/internalRoutes.ts`
7. `backend/src/app.ts`
8. `backend/src/ocr/processor.ts`

---

## Environment Variables Required

```bash
# Frontend origin for CORS
FILOT_FRONTEND_ORIGIN=https://your-frontend-domain.com

# Service key for internal routes
SERVICE_INTERNAL_KEY=your-secure-service-key-here

# Existing R2 configuration
CF_R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
CF_R2_ACCESS_KEY_ID=your-access-key
CF_R2_SECRET_ACCESS_KEY=your-secret-key
CF_R2_BUCKET_NAME=your-bucket-name
```

---

## Manual Testing Instructions

### 1. Upload Test

```bash
# Valid upload (should succeed)
curl -X POST http://localhost:5000/documents/upload \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: multipart/form-data" \
  -F "type=KTP" \
  -F "file=@valid_image.jpg"

# Expected: { "success": true, "documentId": "<uuid>", "document": {...} }
# Note: Response no longer contains public fileUrl

# Invalid file type (should fail)
curl -X POST http://localhost:5000/documents/upload \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: multipart/form-data" \
  -F "type=KTP" \
  -F "file=@malicious.exe"

# Expected: 400 { "error": "Unable to verify file type..." }
```

### 2. Download Test (Presigned URL)

```bash
curl -X GET http://localhost:5000/documents/<document_id>/download \
  -H "Authorization: Bearer <jwt_token>"

# Expected: { "url": "https://...<presigned-url>...", "expiresIn": 300 }

# Try accessing another user's document (should fail)
# Expected: 404 { "error": "Document not found" }
```

### 3. Rate Limit Test

```bash
# Run 11 rapid requests to a sensitive endpoint
for i in {1..11}; do
  curl -X POST http://localhost:5000/documents/upload \
    -H "Authorization: Bearer <jwt_token>" \
    -H "Content-Type: multipart/form-data" \
    -F "type=KTP" \
    -F "file=@test.jpg"
done

# Expected: First 10 succeed, 11th returns:
# 429 { "error": "Too many requests to sensitive endpoint, please try again later" }

# Global rate limit test (60 req/min)
for i in {1..61}; do
  curl -X GET http://localhost:5000/health
done

# Expected: First 60 succeed, 61st returns:
# 429 { "error": "Too many requests, please try again later" }
```

### 4. CORS Test

```bash
# From allowed origin (should succeed)
curl -X OPTIONS http://localhost:5000/documents/upload \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST"

# Expected: 200 with Access-Control-Allow-Origin header

# From disallowed origin (should fail)
curl -X OPTIONS http://localhost:5000/documents/upload \
  -H "Origin: http://malicious-site.com" \
  -H "Access-Control-Request-Method: POST"

# Expected: CORS error
```

### 5. Internal Route Security Test

```bash
# Without service key (should fail)
curl -X POST http://localhost:5000/internal/reviews \
  -H "Content-Type: application/json" \
  -d '{"documentId": "xxx", "userId": "yyy"}'

# Expected: 401 { "error": "Missing service authentication" }

# With invalid service key (should fail)
curl -X POST http://localhost:5000/internal/reviews \
  -H "Content-Type: application/json" \
  -H "x-service-key: wrong-key" \
  -d '{"documentId": "xxx", "userId": "yyy"}'

# Expected: 401 { "error": "Invalid service authentication" }

# With valid service key (should succeed)
curl -X POST http://localhost:5000/internal/reviews \
  -H "Content-Type: application/json" \
  -H "x-service-key: $SERVICE_INTERNAL_KEY" \
  -d '{"documentId": "<valid_doc_id>", "userId": "<valid_user_id>"}'

# Expected: 201 { "taskId": "<uuid>", "status": "accepted" }
```

### 6. File Validation Test

```bash
# Test with valid JPEG
curl -X POST http://localhost:5000/documents/upload \
  -H "Authorization: Bearer <jwt_token>" \
  -F "type=KTP" \
  -F "file=@valid.jpg"

# Expected: Success

# Test with file > 5MB (should fail)
# Create a 6MB test file first
dd if=/dev/zero of=large_file.jpg bs=1M count=6

curl -X POST http://localhost:5000/documents/upload \
  -H "Authorization: Bearer <jwt_token>" \
  -F "type=KTP" \
  -F "file=@large_file.jpg"

# Expected: 400 { "error": "File size exceeds maximum allowed size of 5MB" }

# Test with MIME mismatch (rename .txt to .jpg)
echo "This is text" > fake.jpg

curl -X POST http://localhost:5000/documents/upload \
  -H "Authorization: Bearer <jwt_token>" \
  -F "type=KTP" \
  -F "file=@fake.jpg"

# Expected: 400 { "error": "Unable to verify file type..." }
```

---

## Breaking Changes

1. **Upload Response Changed**: The `/documents/upload` endpoint no longer returns `fileUrl` in the response. Instead, it returns `documentId` which should be used with the new `/documents/:id/download` endpoint to get a presigned URL.

2. **Database Storage Changed**: The `fileUrl` column in the `documents` table now stores the R2 object key instead of a public URL. Existing documents with public URLs are handled via the `extractKeyFromUrl()` helper.

3. **Internal Routes Protected**: All `/internal/*` routes now require the `x-service-key` header. Update BULI2 and any other services that call these endpoints.

---

## Backwards Compatibility

- The `extractKeyFromUrl()` function handles both legacy public URLs and new key-only values
- OCR processor updated to work with both URL formats
- API response format changed but structure remains similar

**Note on File Types:**
Per T6.A specification, only JPEG, PNG, and PDF are now supported for uploads. GIF and WebP were intentionally removed as they are not required for KTP/NPWP document verification. If these formats need to be re-enabled in the future, update:
- `backend/src/utils/fileValidation.ts` - Add magic numbers and MIME types
- `backend/src/controllers/documentsController.ts` - Update ALLOWED_MIME_TYPES array

---

## Not Implemented (Deferred to T6.B/T6.C)

- Retry mechanisms
- Durable queue
- Encryption at rest
- Temporal workflow integration

---

## Security Checklist

- [x] R2 bucket uses private access only
- [x] Presigned URLs expire in 5 minutes
- [x] Global rate limiting: 60 req/min
- [x] Sensitive route rate limiting: 10 req/min  
- [x] CORS restricted to FiLot frontend only
- [x] Internal routes protected with service key
- [x] Service key never logged
- [x] File validation before upload
- [x] Magic number verification
- [x] File size limit: 5MB
- [x] No public URLs exposed in responses
