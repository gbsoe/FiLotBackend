# FiLot Backend - Replit Configuration

## Overview
FiLot Backend is a Node.js/TypeScript REST API server supporting the FiLot mobile financial AI assistant. Its core purpose is to provide secure authentication, user profile management, Indonesian document processing (KTP/NPWP OCR), conversational AI chat capabilities, and integration with external financial services. The project aims to deliver a robust and scalable backend solution for a financial AI assistant, emphasizing modularity, security, and a rich feature set to capture a significant market share in personal finance management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Framework & Runtime
The backend is built on Node.js with TypeScript (strict mode) and Express.js 4.x. It uses CommonJS modules and targets ES2020. Development uses hot-reloading with `ts-node-dev`, compiling to JavaScript for production. This provides a robust, type-safe, and performant foundation.

### Security Architecture
Security is paramount, utilizing Helmet.js for secure HTTP headers, configured CORS for mobile frontend interaction, and JWT-based authentication. Password hashing is handled by bcryptjs, and input validation is enforced using Zod schema validation.

### Error Handling & Logging
A centralized global error handler, a dedicated 404 handler, and a custom logger utility ensure consistent error responses and effective debugging. Morgan middleware is used for HTTP request logging, and process-level handlers manage graceful shutdowns and log unhandled exceptions.

### Project Structure
The project follows a layered architecture, organizing code into `auth`, `config`, `controllers`, `db`, `routes`, `types`, `middlewares`, and `utils` directories within `src/`. This structure promotes separation of concerns, maintainability, and scalability.

### Configuration Management
Environment variables are loaded via `dotenv` from `.env` files, with type-safe configuration managed by `config/env.ts`. Default values are provided for development, and warnings are issued for unset required variables, ensuring robust and flexible deployment across environments.

### Code Quality & Standards
Code quality is maintained through automated tools: ESLint for TypeScript-aware linting, Prettier for consistent code formatting, and strict TypeScript compiler flags to enforce type safety and catch errors early.

### File Upload Handling
Multer is used for handling `multipart/form-data` file uploads, with configurable storage via the `UPLOAD_DIR` environment variable. This allows for flexible storage solutions, including local filesystem initially and cloud storage like S3 later.

### Document Processing & OCR
The system integrates Tesseract OCR for processing Indonesian (KTP/NPWP) and English documents. It features an asynchronous OCR pipeline with an in-memory queue, KTP and NPWP parsers using regex for data extraction, background processing, R2 file download for OCR, and status tracking (uploaded, processing, completed, failed) in the database.

### Hybrid Verification System (Tranche 6)
The verification system combines AI-powered scoring with manual review capabilities:

**AI Scoring Engine** (`verification/aiScoring.ts`):
- Simple rule-based `computeAIScore()` function for KTP/NPWP documents
- Calculates completeness score + format validation bonus
- Auto-verified threshold: score ≥75

**Hybrid Decision Engine** (`verification/hybridEngine.ts`):
- `determineVerificationPath()` determines outcome based on AI score
- Outcomes: `auto_approved` (≥75) or `pending_manual_review` (<75)
- Returns score, outcome, and decision for database persistence

**AI Scoring Service** (`services/aiScoring.ts`):
- Computes confidence scores (0-100) based on parsed data quality
- Validates NIK (16-digit) and NPWP (15-digit) formats
- Automated decisions: `auto_approve` (≥85), `auto_reject` (<35), or `needs_review`

**BULI2 Client** (`buli2/buli2Client.ts`):
- Mock `sendToBuli2()` function for future Buli2 API integration
- Returns ticket ID and queue status

**BULI2 Escalation Service** (`buli2/escalationService.ts`):
- `escalateToBuli2()` handles document escalation workflow
- Updates document with Buli2 ticket ID and verification status
- Persists aiScore and aiDecision for tracking

**BULI2 Integration** (`services/forwardToBuli2.ts`):
- Forwards reviews requiring human verification to BULI2 queue
- Includes retry logic with exponential backoff (3 attempts)
- Supports callback-based decision notification

**OCR Processor Integration**:
- After OCR completion, automatically runs hybrid verification
- Score ≥75 → `auto_approved`, no escalation
- Score <75 → `pending_manual_review`, escalated to Buli2

**Verification Routes** (`routes/verificationRoutes.ts`):
- `POST /verification/evaluate` - Evaluates processed documents
- `GET /verification/status/:documentId` - Returns verification status with aiScore, buli2TicketId
- `POST /verification/:documentId/escalate` - Manually escalates document to Buli2

**Internal BULI2 Routes** (`routes/internalRoutes.ts`):
- `POST /internal/reviews` - Accepts review tasks
- `GET /internal/reviews/:taskId/status` - Check review status
- `POST /internal/reviews/:taskId/decision` - Record manual decision
- `POST /internal/reviews/:reviewId/callback` - Receive decision callbacks

**Temporal Stubs** (`temporal/workflowsStub.ts`):
- `startVerificationWorkflow()` - Stub for future Temporal workflow
- `notifyBuli2ManualReview()` - Stub for Buli2 notification
- KYC Review workflow definition for future Temporal Cloud integration
- Activity stubs for notifications, status updates, and finalization

**Documents Table Schema Updates**:
- `ai_score` - Integer confidence score from AI scoring
- `ai_decision` - Decision string (auto_approve, needs_review, auto_reject)
- `verification_status` - Status (pending, auto_approved, pending_manual_review, etc.)
- `buli2_ticket_id` - Buli2 queue ticket ID for escalated documents
- `processed_at` - Timestamp when OCR processing completed

## External Dependencies

### Production Dependencies
- **express**: Web application framework.
- **cors**: Cross-origin resource sharing middleware.
- **helmet**: Security headers middleware.
- **morgan**: HTTP request logger.
- **dotenv**: Environment variable loader.
- **zod**: TypeScript-first schema validation.
- **jsonwebtoken**: JWT token creation/verification.
- **jose**: Modern JWT verification with JWKS support.
- **bcryptjs**: Password hashing library.
- **multer**: File upload middleware.
- **@aws-sdk/client-s3**: S3-compatible storage client for Cloudflare R2.
- **@aws-sdk/s3-request-presigner**: Signed URL generation.
- **mime-types**: MIME type detection and extension mapping.
- **uuid**: Unique identifier generation.
- **drizzle-orm**: TypeScript ORM for SQL databases.
- **pg**: PostgreSQL client for Node.js.
- **node-tesseract-ocr**: Node.js wrapper for Tesseract OCR.
- **tesseract** (System package): Open source OCR engine.

### Current & Future External Service Integrations
- **BULI2 Review Service**: Hybrid verification system for document review (Integrated in Tranche 6).
- **Temporal Cloud**: Durable workflow execution for KYC review process (Stubs ready).
- **FiLot DeFi API**: For decentralized finance operations.
- **Project Alpha API**: For additional financial services.
- **Email Service**: For password resets and notifications.
- **Session Store**: Potentially Redis for token management.

## Environment Variables (Tranche 6)
```
BULI2_API_URL=http://localhost:8080
BULI2_API_KEY=
BULI2_CALLBACK_URL=http://localhost:8080/internal/reviews
AI_SCORE_THRESHOLD_AUTO_APPROVE=85
AI_SCORE_THRESHOLD_AUTO_REJECT=35
```