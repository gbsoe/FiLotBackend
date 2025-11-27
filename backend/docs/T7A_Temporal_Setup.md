# T7.A Temporal Cloud Setup

This document describes how FiLot connects to Temporal Cloud for GPU-based OCR workflows and hybrid verification.

## Overview

FiLot uses Temporal Cloud as its workflow orchestration platform. This enables:
- Durable, fault-tolerant OCR processing workflows
- Hybrid verification with BULI2 escalation
- Retry logic and timeout handling for long-running tasks
- Activity-based task decomposition

## Architecture

```
FiLot Backend → Temporal Cloud → Temporal Workers → OCR/Verification Activities
```

The backend acts as a Temporal client, submitting workflows to Temporal Cloud. Workers execute activities such as:
- Downloading documents from R2 storage
- Running OCR processing
- Parsing extracted text
- Saving results to the database

## Environment Variables

The following environment variables are required for Temporal Cloud connection:

| Variable | Description | Example |
|----------|-------------|---------|
| `TEMPORAL_ADDRESS` | Temporal Cloud address | `<namespace-id>.tmprl.cloud:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `filot-ocr` |
| `TEMPORAL_API_KEY` | Temporal Cloud API key | `<your-api-key>` |
| `TEMPORAL_TASK_QUEUE` | Task queue name (optional) | `filot-ocr` |

## Namespace Configuration

FiLot uses the `filot-ocr` namespace configured in Temporal Cloud with:
- Standard retention policy
- Production-grade security with mTLS
- API key authentication

## Client Configuration

The Temporal client is initialized with TLS and API key authentication enabled for secure Temporal Cloud connections:

```typescript
import { Connection, Client } from "@temporalio/client";

const connection = await Connection.connect({
  address: process.env.TEMPORAL_ADDRESS!,
  tls: {},
  apiKey: process.env.TEMPORAL_API_KEY!,
});

const client = new Client({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE!,
});
```

**Note:** All three environment variables (`TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY`) are required. The client factory will throw a configuration error if any are missing.

## Health Check Endpoint

A health check endpoint is available at `/health/temporal` to verify Temporal connectivity:

```bash
curl http://localhost:5000/health/temporal
```

Response:
```json
{"ok": true, "temporal": "connected"}
```

## Test Instructions

### 1. Verify Environment Variables

Ensure the following secrets are set in Replit:
- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TEMPORAL_API_KEY`

### 2. Run Connection Test

```bash
cd backend
npm run temporal:test
```

Expected output:
```
Temporal client OK: filot-ocr
```

### 3. Test Health Endpoint

Start the backend server and call:
```bash
curl http://localhost:5000/health/temporal
```

## Troubleshooting

### Connection Errors

1. **Invalid address**: Verify `TEMPORAL_ADDRESS` matches your Temporal Cloud console
2. **Authentication failed**: Check `TEMPORAL_API_KEY` is valid and not expired
3. **Namespace not found**: Confirm `TEMPORAL_NAMESPACE` exists in your Temporal Cloud account

### TLS Errors

Ensure TLS is enabled in the connection configuration. Temporal Cloud requires TLS for all connections.

## Files

| File | Purpose |
|------|---------|
| `src/temporal/temporalClient.ts` | Temporal client factory |
| `src/temporal/workflows.ts` | Workflow definitions |
| `src/temporal/testConnection.ts` | Connection test script |
| `src/temporal/index.ts` | Module exports |

## Related Documentation

- [Temporal Cloud Documentation](https://docs.temporal.io/cloud)
- [Temporal TypeScript SDK](https://docs.temporal.io/typescript)
- T6.D Temporal Preparation documentation
