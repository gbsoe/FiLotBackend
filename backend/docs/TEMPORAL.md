# Temporal Integration Guide

## Overview

This document describes how to integrate the KYC Review workflow with Temporal Cloud for durable, fault-tolerant execution.

**Note:** The current implementation contains TypeScript stubs only. No Temporal runtime is installed or required.

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     KYC Review Workflow                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Send to    │───>│   Wait for   │───>│   Finalize   │          │
│  │   Reviewer   │    │   Decision   │    │   Review     │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                   │                   │                   │
│         v                   v                   v                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │ Sync with    │    │ Fetch        │    │ Update User  │          │
│  │ BULI2        │    │ External     │    │ & Document   │          │
│  │              │    │ Decision     │    │ Status       │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
backend/src/temporal/
├── workflows/
│   └── kycReviewWorkflow.ts    # Workflow definition
├── activities/
│   └── kycActivities.ts        # Activity implementations
└── index.ts                     # Exports
```

## Workflow Definition

### KYC Review Workflow

**Location:** `backend/src/temporal/workflows/kycReviewWorkflow.ts`

**Input:**
```typescript
interface KYCReviewWorkflowInput {
  reviewId: string;
  documentId: string;
  userId: string;
  documentType: "KTP" | "NPWP";
  parsedData: object;
  ocrText: string;
  aiScore: number;
  aiDecision: string;
  reasons: string[];
}
```

**Output:**
```typescript
interface KYCReviewWorkflowOutput {
  success: boolean;
  reviewId: string;
  finalDecision: "approved" | "rejected";
  reviewerNotes?: string;
  completedAt: string;
}
```

**Sequence:**
1. Forward review to BULI2 (syncWithBuli2 activity)
2. Send notification to reviewer (sendNotification activity)
3. Wait for external decision (poll or signal)
4. Update review status (updateReviewStatus activity)
5. Finalize verification (finalizeVerification activity)
6. Send completion notification (sendNotification activity)

## Activities

### Available Activities

| Activity | Description | Timeout | Retry Policy |
|----------|-------------|---------|--------------|
| `sendNotification` | Send notifications to users/reviewers | 30s | 3 attempts |
| `fetchExternalDecision` | Poll BULI2 for decision | 5m | 10 attempts |
| `updateReviewStatus` | Update local review record | 30s | 5 attempts |
| `syncWithBuli2` | Create/update task in BULI2 | 2m | 5 attempts |
| `finalizeVerification` | Update document/user status | 1m | 5 attempts |

### Activity Types

```typescript
// Send notification
interface SendNotificationInput {
  recipientId: string;
  recipientType: "reviewer" | "user" | "admin";
  notificationType: "new_review" | "review_completed" | "reminder";
  reviewId: string;
  documentId: string;
  message?: string;
}

// Fetch external decision
interface FetchExternalDecisionInput {
  reviewId: string;
  buli2TaskId?: string;
  timeoutMs?: number;
}

// Finalize verification
interface FinalizeVerificationInput {
  reviewId: string;
  documentId: string;
  userId: string;
  decision: "approved" | "rejected";
  notes?: string;
}
```

## Temporal Configuration

### Task Queue
```
Name: kyc-review-queue
```

### Workflow ID Pattern
```
kyc-review-{reviewId}
```

### Timeouts
```typescript
const WORKFLOW_TIMEOUTS = {
  executionTimeout: "7d",    // Maximum workflow duration
  runTimeout: "1d",          // Single run timeout
  taskTimeout: "10m",        // Task processing timeout
};
```

### Retry Policy
```typescript
const RETRY_POLICY = {
  initialInterval: "1s",
  backoffCoefficient: 2,
  maximumInterval: "1h",
  maximumAttempts: 5,
};
```

## How to Enable Temporal

### 1. Install Temporal SDK

```bash
cd backend
npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
```

### 2. Environment Variables

Add to `.env`:
```bash
TEMPORAL_ADDRESS=your-namespace.tmprl.cloud:7233
TEMPORAL_NAMESPACE=your-namespace
TEMPORAL_API_KEY=your-api-key
```

### 3. Create Worker

Create `backend/src/temporal/worker.ts`:

```typescript
import { Worker } from '@temporalio/worker';
import * as activities from './activities/kycActivities';

async function run() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows/kycReviewWorkflow'),
    activities,
    taskQueue: 'kyc-review-queue',
  });
  
  await worker.run();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
```

### 4. Create Client

Create `backend/src/temporal/client.ts`:

```typescript
import { Client } from '@temporalio/client';
import { kycReviewWorkflow, KYCReviewWorkflowInput } from './workflows/kycReviewWorkflow';

const client = new Client({
  connection: await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS,
  }),
  namespace: process.env.TEMPORAL_NAMESPACE,
});

export async function startKYCReview(input: KYCReviewWorkflowInput) {
  const handle = await client.workflow.start(kycReviewWorkflow, {
    args: [input],
    taskQueue: 'kyc-review-queue',
    workflowId: `kyc-review-${input.reviewId}`,
  });
  
  return handle.workflowId;
}
```

### 5. Integrate with Verification Flow

Update `verificationRoutes.ts` to start workflow instead of direct forwarding:

```typescript
import { startKYCReview } from '../temporal/client';

// In the needs_review branch:
await startKYCReview({
  reviewId: reviewRecord.id,
  documentId,
  userId,
  documentType,
  parsedData,
  ocrText,
  aiScore: scoringResult.score,
  aiDecision: scoringResult.decision,
  reasons: scoringResult.reasons,
});
```

## Signal Handling

For immediate decision updates (instead of polling), implement a signal:

```typescript
// In workflow
import { defineSignal, setHandler } from '@temporalio/workflow';

const reviewDecisionSignal = defineSignal<[{ decision: string; notes?: string }]>('reviewDecision');

export async function kycReviewWorkflow(input: KYCReviewWorkflowInput) {
  let externalDecision: { decision: string; notes?: string } | undefined;
  
  setHandler(reviewDecisionSignal, (decision) => {
    externalDecision = decision;
  });
  
  // Wait for signal
  await condition(() => externalDecision !== undefined, '7d');
  
  // Continue with finalization...
}
```

## Testing Without Temporal

The current stub implementation allows:
- Unit testing workflow logic
- Testing activity functions in isolation
- Validating input/output types

Run tests:
```bash
npm test -- --grep "temporal"
```

## Monitoring

When deployed with Temporal Cloud:
- View workflow status in Temporal UI
- Monitor task queue health
- Track activity execution times
- Review failed workflow histories

## Migration Path

1. **Phase 1 (Current)**: Stubs with direct HTTP forwarding
2. **Phase 2**: Add Temporal SDK, run worker locally
3. **Phase 3**: Deploy to Temporal Cloud
4. **Phase 4**: Add signals for real-time updates
5. **Phase 5**: Add scheduled reminders and escalations
