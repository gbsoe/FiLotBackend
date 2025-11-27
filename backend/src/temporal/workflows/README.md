# FiLot OCR Temporal Workflows

This document describes the intended Temporal workflow signatures for the FiLot OCR processing pipeline.

## OCR Processing Workflow

### Workflow Name
```
filot.ocrs.workflow
```

### Task Queue
```
filot-ocr
```

### Input
```typescript
interface OCRWorkflowInput {
  documentId: string;  // UUID of the document to process
  userId?: string;     // Optional user ID for context
}
```

### Output
```typescript
interface OCRWorkflowOutput {
  success: boolean;
  documentId: string;
  status: "completed" | "failed";
  parsedData?: Record<string, unknown>;
  error?: string;
  completedAt: string;  // ISO timestamp
}
```

## Activities

The OCR workflow orchestrates the following activities:

### 1. downloadFromR2
Downloads the document file from Cloudflare R2 storage.

**Input:**
```typescript
interface DownloadFromR2Input {
  documentId: string;
  r2Key: string;
}
```

**Output:**
```typescript
interface DownloadFromR2Output {
  success: boolean;
  localPath?: string;
  error?: string;
}
```

**Timeout:** 2 minutes
**Retry Policy:** 5 attempts with 2s initial interval

### 2. runOCR
Executes Tesseract OCR on the downloaded document.

**Input:**
```typescript
interface RunOCRInput {
  documentId: string;
  localPath: string;
  documentType: "KTP" | "NPWP" | "UNKNOWN";
}
```

**Output:**
```typescript
interface RunOCROutput {
  success: boolean;
  rawText?: string;
  error?: string;
}
```

**Timeout:** 10 minutes
**Retry Policy:** 3 attempts with 5s initial interval

### 3. parse
Parses the raw OCR text to extract structured data.

**Input:**
```typescript
interface ParseDocumentInput {
  documentId: string;
  rawText: string;
  documentType: "KTP" | "NPWP" | "UNKNOWN";
}
```

**Output:**
```typescript
interface ParseDocumentOutput {
  success: boolean;
  parsedData?: Record<string, unknown>;
  error?: string;
}
```

**Timeout:** 1 minute
**Retry Policy:** 3 attempts with 1s initial interval

### 4. saveResult
Persists the processing results to the database.

**Input:**
```typescript
interface SaveResultInput {
  documentId: string;
  parsedData: Record<string, unknown>;
  rawText: string;
  status: "completed" | "failed";
}
```

**Output:**
```typescript
interface SaveResultOutput {
  success: boolean;
  error?: string;
}
```

**Timeout:** 1 minute
**Retry Policy:** 3 attempts with 1s initial interval

## Workflow Execution Flow

```
┌─────────────────┐
│  Start Workflow │
│  (documentId)   │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ downloadFromR2  │──── Fetch document from R2
└────────┬────────┘
         │
         v
┌─────────────────┐
│     runOCR      │──── Execute Tesseract OCR
└────────┬────────┘
         │
         v
┌─────────────────┐
│      parse      │──── Extract structured data
└────────┬────────┘
         │
         v
┌─────────────────┐
│   saveResult    │──── Persist to database
└────────┬────────┘
         │
         v
┌─────────────────┐
│  End Workflow   │
│  (OCROutput)    │
└─────────────────┘
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TEMPORAL_ENDPOINT` | Yes* | - | Temporal server address (alternative: `TEMPORAL_ADDRESS`) |
| `TEMPORAL_ADDRESS` | Yes* | - | Temporal server address (alternative: `TEMPORAL_ENDPOINT`) |
| `TEMPORAL_NAMESPACE` | No | `default` | Temporal namespace |
| `TEMPORAL_API_KEY` | No | - | API key for Temporal Cloud |
| `TEMPORAL_TASK_QUEUE` | No | `filot-ocr` | Task queue name |

*One of `TEMPORAL_ENDPOINT` or `TEMPORAL_ADDRESS` is required.

### Worker Configuration

When deploying the Temporal worker:

```typescript
import { Worker } from '@temporalio/worker';

const worker = await Worker.create({
  taskQueue: 'filot-ocr',
  workflowsPath: require.resolve('./workflows'),
  activities: {
    downloadFromR2,
    runOCR,
    parse,
    saveResult,
  },
});

await worker.run();
```

## Security Notes

- Store `TEMPORAL_API_KEY` in secure secrets management (Replit Secrets, AWS Secrets Manager, etc.)
- Never commit credentials to version control
- Use mTLS for Temporal Cloud connections
- Ensure worker has appropriate IAM permissions for R2 access

## Future Implementation

This is a preparation tranche. The actual Temporal workflow execution will be implemented in a future tranche when:

1. Temporal Cloud infrastructure is provisioned
2. mTLS certificates are configured
3. Worker deployment is set up
4. Integration testing is complete

For now, the system defaults to Redis-based queue processing (`OCR_ENGINE=redis`).
