# Tranche 6: Frontend Integration Guide

## Overview

This document describes the frontend changes required to integrate with the Tranche 6 Hybrid Verification system.

## API Endpoints to Use

### 1. Evaluate Document Verification

**Endpoint:** `POST /verification/evaluate`

**When to call:** After a document has been uploaded and OCR processed (status = "completed").

**Request:**
```typescript
const response = await api.post('/verification/evaluate', {
  documentId: string
});
```

**Response:**
```typescript
interface EvaluateResponse {
  documentId: string;
  score: number;           // 0-100
  decision: string;        // 'auto_approve' | 'auto_reject' | 'needs_review'
  verificationStatus: string;  // 'auto_approved' | 'auto_rejected' | 'pending_manual_review'
  reviewId?: string;       // Present if needs_review
  reasons: string[];       // Explanation of scoring
}
```

### 2. Check Verification Status

**Endpoint:** `GET /verification/status/:documentId`

**When to call:** Poll this endpoint if status is `pending_manual_review`.

**Response:**
```typescript
interface StatusResponse {
  documentId: string;
  status: string;  // 'auto_approved' | 'auto_rejected' | 'pending_manual_review' | 'review_result'
  aiScore: number;
  aiDecision: string;
  result?: {
    reviewId: string;
    status: string;        // 'pending' | 'approved' | 'rejected'
    decision?: string;     // Final decision if completed
    notes?: string;        // Reviewer notes
    createdAt: string;
    updatedAt: string;
  };
}
```

## ProfileScreen Changes

### UI Elements to Add

#### 1. Verification Status Badge

Display verification status under document section:

```tsx
// Status badge component
const VerificationBadge = ({ status }: { status: string }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'auto_approved':
      case 'manually_approved':
        return { color: 'green', text: 'Verified', icon: 'checkmark-circle' };
      case 'auto_rejected':
      case 'manually_rejected':
        return { color: 'red', text: 'Rejected', icon: 'close-circle' };
      case 'pending_manual_review':
        return { color: 'orange', text: 'Under Review', icon: 'time' };
      default:
        return { color: 'gray', text: 'Pending', icon: 'hourglass' };
    }
  };
  
  const config = getStatusConfig();
  
  return (
    <View style={styles.badge}>
      <Icon name={config.icon} color={config.color} />
      <Text style={{ color: config.color }}>{config.text}</Text>
    </View>
  );
};
```

#### 2. Start Review Button

Add button to trigger verification for completed documents:

```tsx
const [isEvaluating, setIsEvaluating] = useState(false);

const handleStartReview = async (documentId: string) => {
  setIsEvaluating(true);
  try {
    const result = await api.post('/verification/evaluate', { documentId });
    
    if (result.verificationStatus === 'auto_approved') {
      showToast('Document verified successfully!', 'success');
    } else if (result.verificationStatus === 'auto_rejected') {
      showToast('Document verification failed. Please re-upload.', 'error');
    } else {
      showToast('Document sent for manual review.', 'info');
      startPolling(documentId);
    }
    
    refreshProfile();
  } catch (error) {
    showToast('Verification failed. Please try again.', 'error');
  } finally {
    setIsEvaluating(false);
  }
};

// Button component
<TouchableOpacity
  onPress={() => handleStartReview(document.id)}
  disabled={isEvaluating || document.status !== 'completed'}
  style={styles.reviewButton}
>
  {isEvaluating ? (
    <ActivityIndicator color="white" />
  ) : (
    <Text>Start Review</Text>
  )}
</TouchableOpacity>
```

#### 3. Polling for Manual Review

Implement polling when status is `pending_manual_review`:

```tsx
const [pollingInterval, setPollingInterval] = useState<NodeJS.Timer | null>(null);

const startPolling = (documentId: string) => {
  const interval = setInterval(async () => {
    try {
      const status = await api.get(`/verification/status/${documentId}`);
      
      if (status.status === 'review_result') {
        clearInterval(interval);
        setPollingInterval(null);
        
        if (status.result?.decision === 'approved') {
          showToast('Your document has been approved!', 'success');
          triggerHaptic('success');
        } else {
          showToast('Your document was not approved.', 'error');
        }
        
        refreshProfile();
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 3000); // Poll every 3 seconds
  
  setPollingInterval(interval);
};

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  };
}, [pollingInterval]);
```

#### 4. Pending Review Indicator

Show spinner and message during manual review:

```tsx
{verificationStatus === 'pending_manual_review' && (
  <View style={styles.pendingContainer}>
    <ActivityIndicator size="small" color="#FFA500" />
    <Text style={styles.pendingText}>
      Your document is being reviewed by our team. This usually takes 1-2 business days.
    </Text>
  </View>
)}
```

## API Utility Updates

Add to `utils/api.ts`:

```typescript
// Verification endpoints
export const evaluateDocument = async (documentId: string) => {
  return await post('/verification/evaluate', { documentId });
};

export const getVerificationStatus = async (documentId: string) => {
  return await get(`/verification/status/${documentId}`);
};

// With types
export interface EvaluateDocumentResponse {
  documentId: string;
  score: number;
  decision: 'auto_approve' | 'auto_reject' | 'needs_review';
  verificationStatus: string;
  reviewId?: string;
  reasons: string[];
}

export interface VerificationStatusResponse {
  documentId: string;
  status: 'auto_approved' | 'auto_rejected' | 'pending_manual_review' | 'review_result';
  aiScore: number;
  aiDecision: string;
  result?: {
    reviewId: string;
    status: string;
    decision?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

## User Experience Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Upload Doc    │────>│   OCR Process   │────>│   Show Result   │
│   (Existing)    │     │   (Existing)    │     │   + Review Btn  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        v
                              ┌──────────────────────────────────────┐
                              │         Click "Start Review"         │
                              └──────────────────────────────────────┘
                                                │
                        ┌───────────────────────┼───────────────────────┐
                        v                       v                       v
                 ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
                 │   Auto      │         │   Needs     │         │   Auto      │
                 │   Approved  │         │   Review    │         │   Rejected  │
                 └─────────────┘         └─────────────┘         └─────────────┘
                        │                       │                       │
                        v                       v                       v
                 ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
                 │   ✓ Badge   │         │   ⏳ Badge   │         │   ✗ Badge   │
                 │   Success   │         │   Polling   │         │   Re-upload │
                 │   Toast     │         │   Spinner   │         │   Toast     │
                 └─────────────┘         └─────────────┘         └─────────────┘
                                                │
                                                v
                                         ┌─────────────┐
                                         │   Decision  │
                                         │   Received  │
                                         └─────────────┘
                                                │
                                  ┌─────────────┴─────────────┐
                                  v                           v
                           ┌─────────────┐             ┌─────────────┐
                           │   Approved  │             │   Rejected  │
                           │   Toast     │             │   Toast     │
                           └─────────────┘             └─────────────┘
```

## Styling Suggestions

```typescript
const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  reviewButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  pendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    marginTop: 8,
  },
  pendingText: {
    marginLeft: 8,
    color: '#F57C00',
    fontSize: 12,
    flex: 1,
  },
});
```

## Error Handling

Handle these error scenarios:

1. **Document not processed**: Show message to wait for OCR completion
2. **Already evaluated**: Show current status instead of re-evaluating
3. **Network error**: Retry with exponential backoff
4. **Server error**: Show generic error message with retry option

```typescript
const handleError = (error: any) => {
  if (error.response?.status === 400) {
    if (error.response.data.error.includes('OCR')) {
      showToast('Please wait for document processing to complete.', 'warning');
    } else if (error.response.data.error.includes('already')) {
      // Already evaluated - refresh to show current status
      refreshProfile();
    }
  } else {
    showToast('Something went wrong. Please try again.', 'error');
  }
};
```

## Testing Checklist

- [ ] Upload document → OCR completes → Review button appears
- [ ] Click review → Auto-approved → Green badge shows
- [ ] Click review → Auto-rejected → Red badge, re-upload prompt
- [ ] Click review → Needs review → Orange badge, spinner, polling starts
- [ ] Polling → Decision received → Toast + haptic + badge update
- [ ] Leave and return to screen → Correct status persisted
- [ ] No UI breaks on other screens
