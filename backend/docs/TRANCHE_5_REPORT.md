# Tranche 5: Asynchronous OCR Pipeline - Implementation Report

## Overview

This document outlines the implementation of the asynchronous OCR pipeline for the FiLot backend. The pipeline uses Tesseract OCR to extract text from uploaded KTP (Indonesian ID Card) and NPWP (Tax ID) documents.

## Database Schema Updates

### Modified `documents` Table

The `documents` table schema has been updated with the following changes:

#### Status Enum

Changed from `VARCHAR(50)` to a proper PostgreSQL ENUM type:

```sql
CREATE TYPE document_status AS ENUM (
  'uploaded',
  'processing',
  'completed',
  'failed'
);
```

#### Result JSON Column

Changed from `TEXT` to `JSONB` for better JSON handling and querying:

```sql
ALTER TABLE documents ALTER COLUMN result_json TYPE jsonb;
```

### Status Flow

| Status | Description |
|--------|-------------|
| `uploaded` | Document has been uploaded but not yet queued for processing |
| `processing` | OCR job is currently running |
| `completed` | OCR successfully extracted data |
| `failed` | OCR processing failed |

## Architecture

### Folder Structure

```
backend/src/
├── ocr/
│   ├── tesseractService.ts  # Tesseract OCR wrapper
│   ├── ktpParser.ts         # KTP field extraction
│   ├── npwpParser.ts        # NPWP field extraction
│   └── processor.ts         # Async queue and processor
├── controllers/
│   └── documentProcessController.ts
└── routes/
    └── documentProcessRoutes.ts
```

### Components

#### 1. Tesseract Service (`tesseractService.ts`)

Wraps the `node-tesseract-ocr` library with configuration for Indonesian and English languages.

**Configuration:**
- Languages: `ind+eng`
- OCR Engine Mode (OEM): 1 (LSTM neural net)
- Page Segmentation Mode (PSM): 3 (Fully automatic page segmentation)

**Function:**
```typescript
export async function runOCR(localFilePath: string): Promise<string>
```

#### 2. Document Parsers

##### KTP Parser (`ktpParser.ts`)

Extracts fields from Indonesian ID cards using regex patterns:

- `nik` - National Identification Number (16 digits)
- `name` - Full name
- `birthPlace` - Place of birth
- `birthDate` - Date of birth
- `address` - Residential address
- `gender` - Gender
- `religion` - Religion
- `maritalStatus` - Marital status

**Function:**
```typescript
export function parseKTP(ocrText: string): KTPData
```

##### NPWP Parser (`npwpParser.ts`)

Extracts fields from Indonesian Tax ID cards:

- `npwpNumber` - Tax ID in format XX.XXX.XXX.X-XXX.XXX
- `name` - Taxpayer name

**Function:**
```typescript
export function parseNPWP(ocrText: string): NPWPData
```

#### 3. Async Processor (`processor.ts`)

Manages the background OCR processing queue.

**Features:**
- In-memory queue (no external dependencies)
- 3-second polling interval
- Automatic R2 file download
- Temporary file cleanup
- Error handling and status updates

**Functions:**
```typescript
export function queueDocumentForProcessing(documentId: string)
export function startProcessingLoop()
```

**Processing Flow:**
1. Dequeue next document ID
2. Update status to `processing`
3. Download file from R2 to `/tmp`
4. Run OCR on downloaded file
5. Parse OCR text based on document type
6. Update database with results
7. Set status to `completed` or `failed`
8. Clean up temporary file

#### 4. R2 Storage Service Updates

Added download functionality to `r2Storage.ts`:

```typescript
export const downloadFromR2 = async (key: string): Promise<Buffer>
```

This function retrieves files from Cloudflare R2 storage for OCR processing.

## API Endpoints

### 1. Process Document

**Endpoint:** `POST /documents/:id/process`

**Description:** Queues a document for OCR processing.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters:**
- `id` - Document UUID

**Success Response (200 OK):**
```json
{
  "queued": true,
  "documentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "error": "Document not found"
}
```

**400 Bad Request** - Already processing:
```json
{
  "error": "Document is already being processed"
}
```

**400 Bad Request** - Already completed:
```json
{
  "error": "Document has already been processed"
}
```

### 2. Get Document Result

**Endpoint:** `GET /documents/:id/result`

**Description:** Retrieves the OCR processing status and results.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters:**
- `id` - Document UUID

**Success Response (200 OK) - Completed KTP:**
```json
{
  "status": "completed",
  "result": {
    "nik": "3201234567890123",
    "name": "BUDI SANTOSO",
    "birthPlace": "JAKARTA",
    "birthDate": "15-08-1990",
    "address": "JL. MERDEKA NO. 123",
    "gender": "LAKI-LAKI",
    "religion": "ISLAM",
    "maritalStatus": "KAWIN"
  }
}
```

**Success Response (200 OK) - Completed NPWP:**
```json
{
  "status": "completed",
  "result": {
    "npwpNumber": "12.345.678.9-012.345",
    "name": "BUDI SANTOSO"
  }
}
```

**Success Response (200 OK) - Processing:**
```json
{
  "status": "processing",
  "result": null
}
```

**Success Response (200 OK) - Failed:**
```json
{
  "status": "failed",
  "error": "Failed to perform OCR"
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "error": "Document not found"
}
```

## Complete API Flow Example

### Step 1: Upload Document

```bash
curl -X POST http://localhost:8080/documents/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "type=KTP" \
  -F "file=@ktp.jpg"
```

**Response:**
```json
{
  "success": true,
  "fileUrl": "https://r2.example.com/user-id/KTP_abc-123.jpg",
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "type": "KTP",
    "fileUrl": "https://r2.example.com/user-id/KTP_abc-123.jpg",
    "status": "uploaded",
    "resultJson": null,
    "createdAt": "2025-11-25T15:48:00.000Z"
  }
}
```

### Step 2: Queue for Processing

```bash
curl -X POST http://localhost:8080/documents/550e8400-e29b-41d4-a716-446655440000/process \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "queued": true,
  "documentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Step 3: Check Result (Poll)

```bash
curl -X GET http://localhost:8080/documents/550e8400-e29b-41d4-a716-446655440000/result \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response (Processing):**
```json
{
  "status": "processing",
  "result": null
}
```

**Response (Completed):**
```json
{
  "status": "completed",
  "result": {
    "nik": "3201234567890123",
    "name": "BUDI SANTOSO",
    "birthPlace": "JAKARTA",
    "birthDate": "15-08-1990",
    "address": "JL. MERDEKA NO. 123",
    "gender": "LAKI-LAKI",
    "religion": "ISLAM",
    "maritalStatus": "KAWIN"
  }
}
```

## Configuration

### Environment Variables

No additional environment variables are required. The OCR pipeline uses existing R2 credentials:

- `CF_R2_ENDPOINT`
- `CF_R2_ACCESS_KEY_ID`
- `CF_R2_SECRET_ACCESS_KEY`
- `CF_R2_BUCKET_NAME`

### Processing Queue Configuration

The processing queue is configured in `processor.ts`:

- **Polling Interval:** 3 seconds
- **Queue Type:** In-memory array
- **Concurrency:** 1 (processes one document at a time)
- **Timeout:** None (relies on Tesseract's internal timeout)

## Error Handling

### Types of Errors

1. **File Download Errors**
   - Missing file URL
   - R2 connection issues
   - File not found in R2

2. **OCR Errors**
   - Tesseract processing failures
   - Unreadable images
   - Corrupt files

3. **Parsing Errors**
   - Unknown document type
   - Pattern matching failures

### Error Storage

All errors are stored in the `resultJson` field:

```json
{
  "error": "Failed to perform OCR"
}
```

And the document status is set to `failed`.

## Safety Features

1. **Temporary File Cleanup:** All downloaded files are automatically deleted after processing
2. **Status Validation:** Prevents re-processing of already completed documents
3. **User Ownership Validation:** Users can only process their own documents
4. **Error Isolation:** Errors in one document don't affect other queued documents
5. **Queue Protection:** Documents are not added to queue multiple times

## Testing

### Manual Testing Steps

1. Start the backend server
2. Upload a KTP or NPWP document
3. Queue the document for processing
4. Poll the result endpoint until status is `completed` or `failed`
5. Verify extracted data matches the document

### Automated Testing

Unit tests should cover:
- KTP parser regex patterns
- NPWP parser regex patterns
- Queue management (add, process, remove)
- Error handling scenarios

## Performance Considerations

### Current Implementation

- **Queue:** In-memory (resets on server restart)
- **Concurrency:** Single-threaded processing
- **File Storage:** Temporary files in `/tmp`

### Future Improvements

1. **Persistent Queue:** Use Redis or database-backed queue
2. **Concurrency:** Process multiple documents in parallel
3. **Caching:** Cache OCR results for identical documents
4. **Monitoring:** Add processing time metrics
5. **Retry Logic:** Automatic retry for transient failures

## Limitations

1. **Queue Persistence:** Queue is lost on server restart (documents remain in `processing` state)
2. **Concurrency:** Only one document processed at a time
3. **Language Support:** Currently only Indonesian and English
4. **OCR Accuracy:** Depends on image quality and document format
5. **No Priority Queue:** All documents processed in FIFO order

## Migration Information

### Database Migration

Migration file: `0003_stale_hannibal_king.sql`

**Generated with:**
```bash
npm run db:generate
```

**Applied manually using:**
```sql
ALTER TABLE documents ALTER COLUMN result_json TYPE jsonb USING result_json::jsonb;
ALTER TABLE documents ALTER COLUMN status TYPE document_status USING status::document_status;
```

## Integration with Existing Code

### No Changes Required To:
- Authentication flow (Tranche 3)
- Document upload endpoint (Tranche 4)
- R2 storage upload logic
- User profile management

### New Routes Added:
- `POST /documents/:id/process`
- `GET /documents/:id/result`

### Modified Files:
- `backend/src/db/schema.ts` - Updated schema
- `backend/src/services/r2Storage.ts` - Added download function
- `backend/src/app.ts` - Registered new routes
- `backend/src/index.ts` - Started processing loop

## Conclusion

Tranche 5 successfully implements a complete asynchronous OCR pipeline with:
- ✅ Background processing
- ✅ Status tracking
- ✅ KTP and NPWP parsing
- ✅ Error handling
- ✅ RESTful API endpoints
- ✅ Database integration
- ✅ R2 file handling

The pipeline is ready for production use and can be extended with additional features as needed.
