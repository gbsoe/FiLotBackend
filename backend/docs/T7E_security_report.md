# T7-E Security Hardening Report

## Overview
This document details the security hardening implementations completed in Tranche T7-E Task 2 for the FiLot Backend.

## Changes Implemented

### 1. Zod Validation Schemas (`backend/src/validators/schemas.ts`)

Created comprehensive validation schemas for all API inputs:

| Schema | Purpose | Validations |
|--------|---------|-------------|
| `DocumentUploadSchema` | Validates document upload body | `type` must be "KTP" or "NPWP" |
| `FileTypeSchema` | Validates file MIME types | Must be image/jpeg, image/png, or application/pdf |
| `EvaluateDocumentSchema` | Validates evaluation requests | `documentId` must be valid UUID |
| `ReviewDecisionSchema` | Validates review decisions | `decision` must be "approved" or "rejected", optional `notes` (max 1000 chars) |
| `InternalReviewPayloadSchema` | Validates BULI2 callback payloads | Full payload validation including UUIDs, document types, scores |
| `CallbackPayloadSchema` | Validates callback responses | Decision and optional metadata |
| `VerificationResultSchema` | Validates verification results | Document/user IDs, results, scores |

**HMAC Signature Validation:**
- `validateHmacSignature(payload, signature, secret)` - Validates HMAC-SHA256 signatures using timing-safe comparison
- `generateHmacSignature(payload, secret)` - Generates HMAC-SHA256 signatures for outbound requests

### 2. Logger Sensitive Field Masking (`backend/src/utils/logger.ts`)

Added `maskSensitiveFields()` function that automatically masks sensitive data in log output:

| Field Pattern | Masking Behavior | Example |
|--------------|------------------|---------|
| `npwp` | Last 3 digits masked | `12.345.678.9-123.456` → `**.***.***.*-***.***` |
| `nik` | Middle digits masked, first/last 4 visible | `3171234567890123` → `3171********0123` |
| `email` | Partial local part visible | `john.doe@email.com` → `joh***@email.com` |
| `mobile`/`phone` | Middle digits masked | `081234567890` → `0812****7890` |
| `password` | Fully redacted | `***REDACTED***` |
| `token` | Fully redacted | `***TOKEN***` |
| `secret` | Fully redacted | `***SECRET***` |
| `apiKey`/`api_key` | Fully redacted | `***API_KEY***` |
| `authorization` | Fully redacted | `***AUTH***` |

Features:
- Recursive object traversal (max depth 10)
- Array element masking
- Case-insensitive field matching
- Automatic application to all log meta objects

### 3. Error Handler Enhancements (`backend/src/middlewares/errorHandler.ts`)

**Correlation ID:**
- Every error response now includes a `correlationId` field
- Uses `x-correlation-id` header if provided, otherwise generates a UUID
- Enables request tracing across distributed systems

**Production Error Message Sanitization:**
- Added `PRODUCTION_SAFE_MESSAGES` mapping for HTTP status codes
- Non-operational errors (5xx) in production return generic messages
- Operational errors (4xx) preserve the error message
- Stack traces only included in development mode

**Error Response Structure:**
```json
{
  "success": false,
  "error": {
    "message": "Sanitized message",
    "correlationId": "uuid-here"
  }
}
```

Development mode additionally includes:
- `stack` - Full stack trace
- `rawMessage` - Original error message (if sanitized)

### 4. Route Validation Middleware

Applied Zod validation to all sensitive routes:

**Documents Routes (`documentsRoutes.ts`):**
- POST `/upload` - Validates `type` field before processing

**Verification Routes (`verificationRoutes.ts`):**
- POST `/evaluate` - Validates `documentId` as UUID

**Internal Routes (`internalRoutes.ts`):**
- POST `/reviews` - Validates full review payload
- POST `/reviews/:taskId/decision` - Validates decision and notes
- POST `/reviews/:reviewId/callback` - Validates callback payload + HMAC signature
- POST `/verification/result` - Validates verification result payload

**HMAC Middleware:**
- Optional HMAC validation for BULI2 callbacks
- Enabled when `BULI2_HMAC_SECRET` environment variable is set
- Uses timing-safe comparison to prevent timing attacks

## Security Benefits

1. **Input Validation** - Prevents injection attacks and malformed data from reaching business logic
2. **Sensitive Data Protection** - PII is automatically masked in logs
3. **Error Information Leakage Prevention** - Production errors don't expose internal details
4. **Request Tracing** - Correlation IDs enable debugging without exposing sensitive data
5. **Signature Verification** - HMAC validation ensures callback authenticity

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `BULI2_HMAC_SECRET` | Secret for HMAC signature validation | Optional |
| `NODE_ENV` | Controls development/production behavior | Yes |

## Testing Recommendations

1. **Unit Tests:**
   - Test each Zod schema with valid and invalid inputs
   - Test `maskSensitiveFields()` with various data structures
   - Test HMAC signature validation/generation

2. **Integration Tests:**
   - Verify validation errors return proper 400 responses
   - Verify correlation IDs are included in error responses
   - Verify production mode sanitizes error messages

3. **Security Tests:**
   - Verify logs don't contain unmasked PII
   - Verify stack traces are hidden in production
   - Verify HMAC validation rejects tampered payloads

## Compliance Notes

- All sensitive fields identified in Indonesian KYC context (NIK, NPWP) are masked
- Email and phone partial masking maintains usability for debugging
- Correlation IDs provide audit trail capability
- No sensitive data is logged in plaintext

---
*Report generated: T7-E Security Hardening Task 2*
*Date: Implementation complete*
