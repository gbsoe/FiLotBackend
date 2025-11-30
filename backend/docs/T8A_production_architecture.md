# T8-A: Production Architecture Overview

**Tranche:** T8-A  
**Generated:** 2024-11-30

---

## 1. System Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRODUCTION ENVIRONMENT                          │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────┐
                                    │   Mobile    │
                                    │  App Users  │
                                    └──────┬──────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │    CloudFlare CDN      │
                              │   (DDOS Protection)    │
                              └───────────┬────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                           │
                    ▼                                           ▼
          ┌─────────────────┐                         ┌─────────────────┐
          │   Frontend      │                         │   Backend API   │
          │   app.filot.id  │                         │  api.filot.id   │
          │   (React/Vite)  │                         │  (Express/Node) │
          └────────┬────────┘                         └────────┬────────┘
                   │                                           │
                   │                                           ▼
                   │                              ┌────────────────────────┐
                   │                              │     AWS ECS Fargate    │
                   │                              │    (Backend Service)   │
                   │                              └────────────┬───────────┘
                   │                                           │
                   │              ┌────────────────────────────┼────────────────────────────┐
                   │              │                            │                            │
                   │              ▼                            ▼                            ▼
                   │    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
                   │    │  Neon Postgres  │          │  Upstash Redis  │          │  Cloudflare R2  │
                   │    │   (Database)    │          │    (Queue)      │          │   (Storage)     │
                   │    └─────────────────┘          └────────┬────────┘          └─────────────────┘
                   │                                          │
                   │                                          ▼
                   │                              ┌────────────────────────┐
                   │                              │   ECS GPU Worker       │
                   │                              │   (g4dn.xlarge)        │
                   │                              │   CUDA + Tesseract     │
                   │                              └────────────┬───────────┘
                   │                                           │
                   │                                           ▼
                   │                              ┌────────────────────────┐
                   │                              │   BULI2 Review        │
                   │                              │   (Manual Review)      │
                   └─────────────────────────────►│   External Service     │
                                                  └────────────────────────┘
```

---

## 2. OCR Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           OCR PROCESSING PIPELINE                             │
└──────────────────────────────────────────────────────────────────────────────┘

    Document Upload                    Queue System                    Processing
    ──────────────                    ────────────                    ──────────

    ┌─────────┐                    ┌──────────────┐                ┌─────────────┐
    │ Upload  │                    │              │                │             │
    │ Request │───────────────────►│  Redis Queue │───────────────►│ GPU Worker  │
    │ (API)   │                    │  (LPUSH)     │                │ (ECS)       │
    └─────────┘                    └──────────────┘                └──────┬──────┘
         │                               ▲                                │
         │                               │                                │
         ▼                               │ Fallback                       ▼
    ┌─────────┐                    ┌─────┴────────┐                ┌─────────────┐
    │ R2      │                    │              │                │ Tesseract   │
    │ Storage │                    │ CPU Worker   │◄───────────────│ OCR         │
    │ (File)  │                    │ (Backend)    │    (if GPU     └─────────────┘
    └─────────┘                    └──────────────┘     fails)            │
                                                                          │
                                                                          ▼
    AI Scoring                     Verification                    Result Storage
    ──────────                     ────────────                    ──────────────

    ┌─────────────┐               ┌──────────────┐               ┌──────────────┐
    │ AI Score    │               │ Auto Approve │               │ Update       │
    │ Calculation │──────────────►│ (score ≥ 85) │──────────────►│ Database     │
    │ (0-100)     │               └──────────────┘               └──────────────┘
    └──────┬──────┘                      │
           │                             │
           │ score 35-85                 │
           ▼                             │
    ┌─────────────┐               ┌──────────────┐
    │ Needs       │               │ BULI2        │
    │ Review      │──────────────►│ Escalation   │
    │             │               │ (HTTP POST)  │
    └─────────────┘               └──────┬───────┘
           │                             │
           │ score < 35                  │
           ▼                             ▼
    ┌─────────────┐               ┌──────────────┐
    │ Auto Reject │               │ Manual       │
    │             │               │ Decision     │
    └─────────────┘               │ Callback     │
                                  └──────────────┘
```

---

## 3. Temporal Workflow Architecture (Optional)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         TEMPORAL WORKFLOW (FUTURE)                            │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
    │ Start         │          │ OCR           │          │ AI            │
    │ Workflow      │─────────►│ Activity      │─────────►│ Scoring       │
    │ (API Call)    │          │               │          │ Activity      │
    └───────────────┘          └───────────────┘          └───────┬───────┘
                                                                  │
                               ┌──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │ Auto      │        │ Wait for  │        │ Auto      │
    │ Approve   │        │ Signal    │        │ Reject    │
    │ (≥85)     │        │ (35-85)   │        │ (<35)     │
    └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
          │                    │                    │
          │              ┌─────┴─────┐              │
          │              │ Human     │              │
          │              │ Decision  │              │
          │              │ Signal    │              │
          │              └─────┬─────┘              │
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                               ▼
                        ┌───────────────┐
                        │ Update        │
                        │ Database      │
                        │ Activity      │
                        └───────────────┘
```

---

## 4. Redis Queue Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            REDIS QUEUE STRUCTURE                              │
└──────────────────────────────────────────────────────────────────────────────┘

    Queue Keys                          Data Structures
    ──────────                          ───────────────

    filot:ocr:queue                     LIST  → [docId1, docId2, docId3, ...]
         │
         └─────────────────────────────►  LPUSH (Producer)
                                          BRPOP (Consumer)

    filot:ocr:gpu:queue                 LIST  → [docId1, docId2, ...]
         │
         ├─────────────────────────────►  RPUSH (Backend)
         └─────────────────────────────►  LPOP (GPU Worker)

    filot:ocr:gpu:processing            SET   → {docId1, docId2}
         │
         ├─────────────────────────────►  SADD (Start Processing)
         └─────────────────────────────►  SREM (Complete)

    filot:ocr:gpu:attempts              HASH  → {docId1: 1, docId2: 2}
         │
         └─────────────────────────────►  HINCRBY (Increment)

    filot:ocr:gpu:processing:timestamps HASH  → {docId1: 1701234567890}
         │
         └─────────────────────────────►  HSET/HDEL (Timing)

    filot:ocr:gpu:lock:{docId}          STRING → correlationId (EX 600)
         │
         └─────────────────────────────►  SET NX (Distributed Lock)

    filot:ocr:gpu:results               CHANNEL → PubSub
         │
         └─────────────────────────────►  PUBLISH (Results)
                                          SUBSCRIBE (Listeners)
```

---

## 5. ECS Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            AWS ECS ARCHITECTURE                               │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │                     VPC (ap-southeast-2)                         │
    │                                                                  │
    │   ┌─────────────────────────────────────────────────────────┐   │
    │   │                    ECS Cluster                           │   │
    │   │                  filot-production                        │   │
    │   │                                                          │   │
    │   │   ┌───────────────────┐     ┌───────────────────┐       │   │
    │   │   │  ECS Service      │     │  ECS Service      │       │   │
    │   │   │  Backend API      │     │  GPU OCR Worker   │       │   │
    │   │   │                   │     │                   │       │   │
    │   │   │  Fargate          │     │  EC2 (g4dn.xl)    │       │   │
    │   │   │  2 vCPU / 4GB     │     │  4 vCPU / 16GB    │       │   │
    │   │   │  Auto-scaling     │     │  1 NVIDIA T4 GPU  │       │   │
    │   │   └───────────────────┘     └───────────────────┘       │   │
    │   │                                                          │   │
    │   └─────────────────────────────────────────────────────────┘   │
    │                                                                  │
    │   ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐   │
    │   │ ECR Repository  │  │ Secrets Manager │  │ CloudWatch   │   │
    │   │ GPU Worker Image│  │ Credentials     │  │ Logs/Metrics │   │
    │   └─────────────────┘  └─────────────────┘  └──────────────┘   │
    │                                                                  │
    └─────────────────────────────────────────────────────────────────┘

                                    │
                                    │ External Services
                                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ Neon PostgreSQL │  │ Upstash Redis   │  │ Cloudflare R2   │
    │ (Managed DB)    │  │ (Managed Cache) │  │ (Object Store)  │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 6. Monitoring Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         MONITORING & OBSERVABILITY                            │
└──────────────────────────────────────────────────────────────────────────────┘

    Application                  CloudWatch                    Alerting
    ───────────                  ──────────                    ────────

    ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
    │ Structured  │────────────►│ Log Groups  │────────────►│ Log Insights│
    │ JSON Logs   │             │ /ecs/filot  │             │ Queries     │
    └─────────────┘             └─────────────┘             └─────────────┘

    ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
    │ EMF Metrics │────────────►│ Custom      │────────────►│ CloudWatch  │
    │ (Embedded)  │             │ Metrics     │             │ Alarms      │
    └─────────────┘             │ FiLot/*     │             └──────┬──────┘
                                └─────────────┘                    │
                                                                   ▼
    ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
    │ /metrics    │────────────►│ Dashboard   │             │ SNS Topics  │
    │ Endpoint    │ (Polling)   │ Real-time   │             │ PagerDuty   │
    └─────────────┘             └─────────────┘             └─────────────┘

    Metrics Collected:
    ─────────────────
    • filot.queue_length (GPU, CPU, BULI2)
    • filot.gpu.active_jobs
    • filot.gpu.processing_time_ms
    • filot.buli2.retry_count
    • filot.circuit_breaker.state
    • filot.http.request_duration_ms
```

---

## 7. Security Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SECURITY LAYERS                                      │
└──────────────────────────────────────────────────────────────────────────────┘

    External                    Application                   Data
    ────────                    ───────────                   ────

    ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
    │ CloudFlare  │            │ Helmet.js   │            │ Encryption  │
    │ WAF/DDOS    │────────────│ CORS        │────────────│ At Rest     │
    │ TLS 1.3     │            │ Rate Limit  │            │ (Neon/R2)   │
    └─────────────┘            └─────────────┘            └─────────────┘

    ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
    │ Stack Auth  │            │ JWT Tokens  │            │ Presigned   │
    │ (Identity)  │────────────│ Service Key │────────────│ URLs (R2)   │
    └─────────────┘            └─────────────┘            └─────────────┘

    ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
    │ VPC         │            │ Input       │            │ PII         │
    │ Isolation   │────────────│ Validation  │────────────│ Masking     │
    └─────────────┘            │ (Zod)       │            │ (Logs)      │
                               └─────────────┘            └─────────────┘
```

---

*Generated as part of Tranche T8-A: Production Deployment Preparation*
