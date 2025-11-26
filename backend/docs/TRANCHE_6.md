# Tranche 6: Hybrid Verification System (FiLot ↔ BULI2)

## Overview

Tranche 6 implements an AI-powered document verification flow that combines automated scoring with manual review capabilities. The system integrates FiLot's OCR pipeline with BULI2's review queue for documents that require human verification.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Document      │     │   AI Scoring    │     │     BULI2       │
│   Upload/OCR    │────>│   Service       │────>│   Review Queue  │
│   (Existing)    │     │   (New)         │     │   (New)         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │                        │
                              v                        v
                        ┌─────────────────┐     ┌─────────────────┐
                        │  Auto Approve   │     │  Manual Review  │
                        │  Auto Reject    │     │  Decision       │
                        └─────────────────┘     └─────────────────┘
                              │                        │
                              └────────────┬───────────┘
                                           v
                              ┌─────────────────┐
                              │  Update User    │
                              │  Profile Status │
                              └─────────────────┘
```

## Decision Flow

1. **After OCR Parsing**: System computes an AI score (0-100)
2. **Scoring Rules**:
   - `auto_approve`: Score ≥ 85 AND all required fields valid
   - `auto_reject`: Score < 35 AND critical fields missing/invalid
   - `needs_review`: All other cases
3. **Manual Review**: If `needs_review`, task is forwarded to BULI2

## New Endpoints

### FiLot Backend

#### POST `/verification/evaluate`
Evaluates a processed document and returns scoring decision.

**Request:**
```json
{
  "documentId": "uuid"
}
```

**Response:**
```json
{
  "documentId": "uuid",
  "score": 75,
  "decision": "needs_review",
  "verificationStatus": "pending_manual_review",
  "reviewId": "uuid",
  "reasons": [
    "NIK is valid (16 digits)",
    "Name is present",
    "Birth date is missing",
    "OCR confidence: 72%",
    "Score 75 requires manual review"
  ]
}
```

#### GET `/verification/status/:documentId`
Returns current verification status for a document.

**Response:**
```json
{
  "documentId": "uuid",
  "status": "pending_manual_review",
  "aiScore": 75,
  "aiDecision": "needs_review",
  "result": {
    "reviewId": "uuid",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### BULI2 Internal Endpoints

#### POST `/internal/reviews`
Accepts a review task from FiLot.

**Request:**
```json
{
  "reviewId": "uuid",
  "documentId": "uuid",
  "userId": "uuid",
  "documentType": "KTP",
  "parsedData": {...},
  "ocrText": "...",
  "score": 75,
  "decision": "needs_review",
  "reasons": [...],
  "callbackUrl": "https://filot.example/internal/reviews/uuid/callback"
}
```

**Response:**
```json
{
  "taskId": "uuid",
  "status": "accepted"
}
```

#### GET `/internal/reviews/:taskId/status`
Returns status of a review task.

#### POST `/internal/reviews/:taskId/decision`
Records a manual review decision.

**Request:**
```json
{
  "decision": "approved",
  "notes": "All documents verified correctly"
}
```

#### POST `/internal/reviews/:reviewId/callback`
Callback endpoint for BULI2 to notify FiLot of decisions.

## Database Schema

### New Table: `manual_reviews`

```sql
CREATE TABLE manual_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  user_id UUID NOT NULL REFERENCES users(id),
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  decision VARCHAR(50),
  confidence INTEGER,
  notes TEXT,
  buli2_task_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Modified Tables

#### `documents` - New Columns:
- `verification_status`: VARCHAR(50) - pending, auto_approved, auto_rejected, pending_manual_review, manually_approved, manually_rejected
- `ai_score`: INTEGER - AI confidence score (0-100)
- `ai_decision`: VARCHAR(50) - auto_approve, auto_reject, needs_review
- `ocr_text`: TEXT - Raw OCR output for reference

#### `users` - New Column:
- `verification_status`: VARCHAR(50) - Overall user verification status

## Environment Variables

Add to `.env`:

```bash
# BULI2 Integration
BULI2_API_URL=https://buli2.example.internal
BULI2_API_KEY=your-api-key-here
BULI2_CALLBACK_URL=https://filot.example.internal/internal/reviews

# AI Scoring Thresholds
AI_SCORE_THRESHOLD_AUTO_APPROVE=85
AI_SCORE_THRESHOLD_AUTO_REJECT=35
```

## File Structure

```
backend/src/
├── services/
│   ├── aiScoring.ts          # AI scoring logic
│   └── forwardToBuli2.ts     # BULI2 API client
├── routes/
│   ├── verificationRoutes.ts # Verification endpoints
│   └── internalRoutes.ts     # BULI2 internal endpoints
├── temporal/                  # Temporal workflow stubs
│   ├── workflows/
│   │   └── kycReviewWorkflow.ts
│   ├── activities/
│   │   └── kycActivities.ts
│   └── index.ts
└── db/
    └── schema.ts              # Updated with manual_reviews
```

## AI Scoring Algorithm

### KTP Documents
| Field | Points | Condition |
|-------|--------|-----------|
| NIK | 30 | Valid 16-digit format |
| Name | 20 | Present and ≥3 characters |
| Birth Date | 15 | Present |
| Address | 15 | Present and ≥10 characters |
| OCR Confidence | 20 | Based on text quality |

### NPWP Documents
| Field | Points | Condition |
|-------|--------|-----------|
| NPWP Number | 40 | Valid 15-digit format |
| Name | 30 | Present and ≥3 characters |
| OCR Confidence | 30 | Based on text quality |

## Testing Steps

### 1. Run Database Migration
```bash
cd backend
npm run db:push
```

### 2. Start Backend Server
```bash
npm run dev
```

### 3. Test Verification Flow

```bash
# Upload and process a document first (existing flow)
# Then evaluate it:
curl -X POST http://localhost:8080/verification/evaluate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"documentId": "your-document-id"}'

# Check status:
curl http://localhost:8080/verification/status/your-document-id \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. Simulate BULI2 Decision

```bash
# Record a manual decision:
curl -X POST http://localhost:8080/internal/reviews/task-id/decision \
  -H "Content-Type: application/json" \
  -d '{"decision": "approved", "notes": "Verified successfully"}'
```

## Error Handling

- All endpoints return structured error responses
- BULI2 forwarding includes retry logic (3 attempts with exponential backoff)
- Failed forwarding is logged but doesn't block the local review record creation

## Logging

All verification actions are logged with structured data:
- AI scoring decisions with scores and reasons
- BULI2 forwarding attempts and results
- Manual review decisions and callbacks
