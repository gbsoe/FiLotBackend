# CloudWatch Log Queries for FiLot Production

## Backend API Queries

### Find All Errors (Last Hour)
```
fields @timestamp, @message, @logStream
| filter @message like /ERROR|error|Error/
| sort @timestamp desc
| limit 100
```

### API Response Times
```
fields @timestamp, @message
| filter @message like /request completed/
| parse @message /duration=(?<duration>\d+)ms/
| stats avg(duration) as avg_ms, max(duration) as max_ms, min(duration) as min_ms by bin(5m)
```

### Health Check Status
```
fields @timestamp, @message
| filter @message like /health/
| sort @timestamp desc
| limit 50
```

### Authentication Failures
```
fields @timestamp, @message
| filter @message like /auth|authentication|unauthorized|401/i
| sort @timestamp desc
| limit 100
```

### Document Upload Activity
```
fields @timestamp, @message
| filter @message like /upload|document/i
| sort @timestamp desc
| limit 100
```

## GPU OCR Worker Queries

### GPU Detection Status
```
fields @timestamp, @message
| filter @message like /GPU|nvidia|cuda/i
| sort @timestamp desc
| limit 50
```

### OCR Processing Times
```
fields @timestamp, @message
| filter @message like /OCR completed|processing_time/
| parse @message /processing_time_ms=(?<time>\d+)/
| stats avg(time) as avg_ms, max(time) as max_ms, count(*) as total by bin(5m)
```

### Queue Consumer Status
```
fields @timestamp, @message
| filter @message like /queue|consuming|job/i
| sort @timestamp desc
| limit 100
```

### OCR Failures
```
fields @timestamp, @message
| filter @message like /OCR failed|OCR error|tesseract/i
| sort @timestamp desc
| limit 100
```

### GPU Memory Usage
```
fields @timestamp, @message
| filter @message like /memory|GPU memory/i
| sort @timestamp desc
| limit 50
```

## BULI2 Integration Queries

### BULI2 API Calls
```
fields @timestamp, @message
| filter @message like /BULI2|buli2/i
| sort @timestamp desc
| limit 100
```

### BULI2 Retry Activity
```
fields @timestamp, @message
| filter @message like /retry|BULI2/i
| sort @timestamp desc
| limit 100
```

### Escalation Events
```
fields @timestamp, @message
| filter @message like /escalate|needs_review|manual_review/i
| sort @timestamp desc
| limit 100
```

## Database Queries

### Database Connection Errors
```
fields @timestamp, @message
| filter @message like /database|postgres|connection|ECONNREFUSED/i
| filter @message like /error|ERROR|failed/i
| sort @timestamp desc
| limit 50
```

### Slow Queries
```
fields @timestamp, @message
| filter @message like /slow query|query time/i
| sort @timestamp desc
| limit 50
```

## Redis Queries

### Redis Connection Issues
```
fields @timestamp, @message
| filter @message like /redis|REDIS/i
| filter @message like /error|ERROR|disconnect|timeout/i
| sort @timestamp desc
| limit 50
```

### Queue Operations
```
fields @timestamp, @message
| filter @message like /RPUSH|LPOP|LRANGE|redis queue/i
| sort @timestamp desc
| limit 100
```

## Temporal Workflow Queries

### Workflow Status
```
fields @timestamp, @message
| filter @message like /temporal|workflow/i
| sort @timestamp desc
| limit 100
```

### Workflow Errors
```
fields @timestamp, @message
| filter @message like /temporal|workflow/i
| filter @message like /error|ERROR|failed/i
| sort @timestamp desc
| limit 50
```

## System Health Queries

### Container Startup
```
fields @timestamp, @message
| filter @message like /started|listening|ready/i
| sort @timestamp desc
| limit 50
```

### Out of Memory Events
```
fields @timestamp, @message
| filter @message like /OOM|out of memory|heap/i
| sort @timestamp desc
| limit 50
```

### Crash/Restart Events
```
fields @timestamp, @message
| filter @message like /crash|restart|SIGTERM|SIGKILL|exit/i
| sort @timestamp desc
| limit 50
```

---

## Usage Instructions

1. Navigate to CloudWatch > Logs > Log Insights
2. Select log group:
   - Backend: `/ecs/filot-backend`
   - GPU Worker: `/ecs/filot-ocr-gpu-worker`
3. Paste query
4. Set time range
5. Run query

## AWS CLI Examples

```bash
# Tail backend logs
aws logs tail /ecs/filot-backend --follow --region ap-southeast-2

# Filter errors in last hour
aws logs filter-log-events \
  --log-group-name /ecs/filot-backend \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region ap-southeast-2

# Export logs to S3
aws logs create-export-task \
  --log-group-name /ecs/filot-backend \
  --from $(date -d '1 day ago' +%s)000 \
  --to $(date +%s)000 \
  --destination your-s3-bucket \
  --destination-prefix filot-logs \
  --region ap-southeast-2
```
