# Tranche 4 — Document Upload & R2 Integration

## Overview

This tranche implements document upload functionality with Cloudflare R2 (S3-compatible) storage integration. Users can upload KTP and NPWP documents, which are securely stored in R2 and tracked in the database.

---

## What's Included

### 1. R2 S3-compatible Storage Integration
- AWS SDK for S3-compatible operations
- Automatic file upload to Cloudflare R2
- User-based folder structure (`userId/type_uuid.ext`)
- Support for KTP and NPWP document types

### 2. Upload Endpoint
**POST** `/documents/upload`

Upload a document (KTP or NPWP) with authentication required.

### 3. Database Integration
- Automatic URL storage in `documents` table
- Track upload status (`uploaded`, `pending`, etc.)
- Link documents to user accounts
- Store metadata for future OCR processing

### 4. Security Features
- JWT authentication required
- File validation by MIME type
- User-scoped file storage
- Secure credential management via environment variables

---

## API Documentation

### Upload Document

**Endpoint**: `POST /documents/upload`

**Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data
```

**Request Body** (multipart/form-data):
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Document type: "KTP" or "NPWP" |
| `file` | binary | Yes | The document file to upload |

**Example Request** (using curl):
```bash
curl -X POST http://localhost:8080/documents/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "type=KTP" \
  -F "file=@/path/to/ktp.jpg"
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "fileUrl": "https://[account-id].r2.cloudflarestorage.com/[bucket]/[user-id]/KTP_abc-123.jpg",
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "type": "KTP",
    "fileUrl": "https://[account-id].r2.cloudflarestorage.com/[bucket]/[user-id]/KTP_abc-123.jpg",
    "status": "uploaded",
    "resultJson": null,
    "createdAt": "2025-11-25T10:30:00.000Z"
  }
}
```

**Error Responses**:

**400 Bad Request** - No file uploaded:
```json
{
  "error": "No file uploaded"
}
```

**400 Bad Request** - Invalid document type:
```json
{
  "error": "Invalid document type"
}
```

**401 Unauthorized** - Missing or invalid JWT:
```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error** - Upload failed:
```json
{
  "error": "Upload failed"
}
```

---

## Environment Variables

Add these to your `.env` file:

```env
# Cloudflare R2 Configuration
CF_R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
CF_R2_ACCESS_KEY_ID=your_access_key_id
CF_R2_SECRET_ACCESS_KEY=your_secret_access_key
CF_R2_BUCKET_NAME=your_bucket_name
CF_ACCOUNT_ID=your_cloudflare_account_id

# Public URL Configuration (REQUIRED for production)
CF_R2_PUBLIC_BASE_URL=https://your-custom-domain.com
# OR if using R2.dev subdomain (requires bucket to be public):
# CF_R2_PUBLIC_BASE_URL=https://your-bucket.your-account-id.r2.dev
```

### Important Configuration Notes

**CF_R2_PUBLIC_BASE_URL**: This variable is **required** for production deployments. It should point to either:
1. A custom domain configured with R2 public access
2. The R2.dev subdomain (requires bucket to have public access enabled)

**R2 Bucket Public Access**: The R2 bucket **must** be configured with public access for file URLs to be accessible. In the Cloudflare dashboard:
1. Navigate to R2 → Your Bucket → Settings
2. Enable "Public Access" or configure a custom domain
3. Set appropriate access policies

If `CF_R2_PUBLIC_BASE_URL` is not set, the system will fall back to `https://${bucket}.${accountId}.r2.dev`, but this will **only work** if the bucket has public access enabled.

---

## File Structure

### New Files Added

```
backend/src/
├── services/
│   └── r2Storage.ts              # R2 storage operations (upload, delete)
├── controllers/
│   └── documentsController.ts    # Document upload controller
└── routes/
    └── documentsRoutes.ts        # Document routes (with multer middleware)
```

### Modified Files
- `backend/src/app.ts` - Registered `/documents` routes
- `backend/package.json` - Added AWS SDK and mime-types dependencies

---

## Dependencies Added

### Production Dependencies
- `@aws-sdk/client-s3` - S3 client for R2 operations
- `@aws-sdk/s3-request-presigner` - Generate signed URLs (future use)
- `mime-types` - MIME type detection and extension mapping

### Development Dependencies
- `@types/mime-types` - TypeScript types for mime-types

---

## File Upload Flow

1. **User Request**: Client sends POST request with JWT token and file
2. **Authentication**: `authRequired` middleware validates JWT
3. **File Validation**: 
   - Check file exists
   - Validate document type (KTP/NPWP)
   - Check MIME type against whitelist
   - Validate file extension
   - Enforce 10MB size limit
4. **Generate Key**: Create unique file key: `userId/TYPE_uuid.extension`
5. **Upload to R2**: Upload file buffer to Cloudflare R2
6. **Database Entry**: Store document metadata in `documents` table
7. **Response**: Return file URL and document object to client

---

## Supported File Types

The system accepts common image and document formats:
- **Images**: JPEG, PNG, GIF, WebP
- **Documents**: PDF

File type is determined by MIME type from the uploaded file.

---

## File Size Limits

**Current Configuration**: 10MB maximum file size (configured in multer)

**Memory Storage Considerations**:
- Uses in-memory buffering for uploads
- Under high concurrent load, large files can exhaust memory
- For production with heavy traffic, consider:
  - Implementing rate limiting per user
  - Monitoring memory usage
  - Using disk-based storage or streaming for very large files
  - Load balancing across multiple instances

---

## Security Considerations

### Authentication
- All upload endpoints require valid JWT token
- User can only upload documents to their own account
- Explicit user verification before processing uploads

### File Validation (Current Implementation)
- **MIME Type Whitelist**: Only images (JPEG, PNG, GIF, WebP) and PDF allowed
- **Extension Validation**: Checks file extension against allowed list
- **File Size Limit**: 10MB maximum per upload
- **Document Type Restriction**: Only KTP and NPWP documents accepted

### File Validation (Limitations & Future Enhancements)
⚠️ **Current Limitation**: File validation uses MIME type and extension checks only. These can be spoofed.

**Recommended Production Enhancements**:
- **Magic Number Verification**: Inspect binary file signatures to confirm actual file type
- **Content Scanning**: Implement virus/malware scanning before storage
- **Deep Inspection**: Use libraries like `file-type` or `mmmagic` for binary verification
- **Sanitization**: Process and re-encode images to strip potential exploits

### File Storage
- Files are organized by user ID (prevents unauthorized access)
- Unique UUID-based filenames prevent collisions
- Content-Type headers set correctly for proper browser rendering

### Environment Variables
- Sensitive R2 credentials stored in environment variables
- Never commit `.env` file to version control
- Use Replit Secrets for production deployments

### Additional Production Recommendations
- Implement rate limiting to prevent abuse (e.g., max 10 uploads per hour)
- Add audit logging for all upload activities
- Generate time-limited signed URLs for downloads instead of permanent public URLs
- Set up CDN caching for frequently accessed documents
- Implement automatic file cleanup for failed uploads
- Add monitoring and alerting for suspicious upload patterns

---

## Integration Notes for Frontend

### Example React/React Native Upload

```typescript
const uploadDocument = async (file: File, type: 'KTP' | 'NPWP', token: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);

  const response = await fetch('http://localhost:8080/documents/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  return await response.json();
};
```

### Example Expo/React Native Upload

```typescript
import * as DocumentPicker from 'expo-document-picker';

const pickAndUploadDocument = async (type: 'KTP' | 'NPWP', token: string) => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
  });

  if (result.type !== 'success') return;

  const formData = new FormData();
  formData.append('file', {
    uri: result.uri,
    type: result.mimeType,
    name: result.name,
  } as any);
  formData.append('type', type);

  const response = await fetch('http://localhost:8080/documents/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  return await response.json();
};
```

---

## Testing

### Test Upload with curl

```bash
# 1. Login to get JWT token
TOKEN=$(curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  | jq -r '.token')

# 2. Upload KTP document
curl -X POST http://localhost:8080/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=KTP" \
  -F "file=@./test-ktp.jpg"

# 3. Upload NPWP document
curl -X POST http://localhost:8080/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=NPWP" \
  -F "file=@./test-npwp.pdf"
```

---

## Next Steps: Tranche 5 — Document Processing Pipeline

The next phase will add:

1. **OCR Integration** (e.g., Google Vision API, Tesseract)
   - Extract text from uploaded documents
   - Parse KTP fields (NIK, name, address, etc.)
   - Parse NPWP fields (NPWP number, name, etc.)

2. **Document Processing Endpoints**
   - `POST /documents/:id/process` - Trigger OCR processing
   - `GET /documents/:id/result` - Get OCR results

3. **Data Validation**
   - Validate extracted data against expected formats
   - Flag suspicious or incomplete extractions

4. **Webhook Support**
   - Async processing notifications
   - Status updates via webhooks

---

## Changelog

### 2025-11-25 - Tranche 4 Complete
- ✅ Implemented R2 storage service
- ✅ Created document upload controller
- ✅ Added `/documents/upload` endpoint
- ✅ Integrated with existing authentication
- ✅ Added AWS SDK dependencies
- ✅ Updated documentation

---

## Support

For questions or issues related to document upload:
1. Check environment variables are configured correctly
2. Verify R2 bucket permissions allow PUT operations
3. Check JWT token is valid and not expired
4. Review backend logs for detailed error messages
