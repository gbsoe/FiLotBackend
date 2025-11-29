# FiLot Backend

**FiLot Backend API** - A Node.js/TypeScript backend for the FiLot mobile financial AI assistant application.

---

## Phase 1 (Initialization) - ✅ COMPLETED

This phase establishes the backend foundation without business logic or database connections.

## Phase 2 (Database) - ✅ COMPLETED

This phase adds PostgreSQL database integration with Drizzle ORM, user schema, and document management.

### What Has Been Built

#### 1. Project Structure
```
backend/
├── src/
│   ├── config/
│   │   └── env.ts                 # Environment configuration
│   ├── controllers/
│   │   ├── health.controller.ts   # Health check controller
│   │   └── documentsController.ts # Document upload controller ✅
│   ├── db/                        # Database layer (Tranche 2)
│   │   ├── schema.ts              # Drizzle ORM schema definitions
│   │   ├── index.ts               # Database connection
│   │   ├── utils.ts               # Database utility functions
│   │   └── migrations/            # Generated migration files
│   ├── routes/
│   │   ├── health.routes.ts       # Health check routes
│   │   ├── authRoutes.ts          # Authentication routes ✅
│   │   ├── profileRoutes.ts       # Profile routes ✅
│   │   └── documentsRoutes.ts     # Document upload routes ✅
│   ├── services/
│   │   └── r2Storage.ts           # Cloudflare R2 storage service ✅
│   ├── auth/
│   │   ├── jwt.ts                 # JWT utilities ✅
│   │   ├── middleware.ts          # Auth middleware ✅
│   │   └── stackAuth.ts           # Stack Auth integration ✅
│   ├── middlewares/
│   │   └── errorHandler.ts        # Global error handler & 404
│   ├── utils/
│   │   └── logger.ts              # Logging utility
│   ├── app.ts                     # Express app setup
│   └── index.ts                   # Server entry point
├── docs/
│   ├── TRANCHE_1_DOCUMENTATION.md # Phase 1 documentation
│   ├── TRANCHE_2_REPORT.md        # Phase 2 report
│   ├── TRANCHE_3_REPORT.md        # Phase 3 report
│   ├── DB_OVERVIEW.md             # Database documentation (Tranche 2)
│   └── TRANCHE_4_DOCUMENTS.md     # Document upload documentation ✅
├── package.json
├── drizzle.config.ts              # Drizzle kit configuration (Tranche 2)
├── tsconfig.json                  # TypeScript strict config
├── .eslintrc.json                 # ESLint config
├── .prettierrc                    # Prettier config
├── .env.example                   # Environment template
└── .gitignore
```

#### 2. Core Dependencies

**Production**:
- `express` - Web framework
- `cors` - Cross-origin resource sharing
- `helmet` - Security headers
- `morgan` - HTTP request logging
- `dotenv` - Environment variables
- `drizzle-orm` - Type-safe ORM for PostgreSQL ✅
- `drizzle-kit` - Database migration toolkit ✅
- `pg` - PostgreSQL client ✅
- `zod` - Schema validation (ready for use)
- `jsonwebtoken` - JWT tokens ✅
- `bcryptjs` - Password hashing ✅
- `multer` - File uploads ✅
- `@aws-sdk/client-s3` - S3-compatible storage client ✅
- `@aws-sdk/s3-request-presigner` - Signed URL generation ✅
- `mime-types` - MIME type detection ✅
- `uuid` - Unique ID generation

**Development**:
- `typescript` - TypeScript compiler
- `ts-node-dev` - Hot reload dev server
- `eslint` - Code linting
- `prettier` - Code formatting
- All necessary @types/* packages

#### 3. Features Implemented

✅ **Express Server**
- Strict TypeScript configuration
- CORS enabled for cross-origin requests
- Helmet for security headers
- Morgan for HTTP logging (dev/production modes)
- JSON body parsing
- URL-encoded body parsing

✅ **Health Check Endpoint**
- `GET /health` - Returns server status
  ```json
  {
    "status": "ok",
    "uptime": 123,
    "timestamp": "2025-11-23T17:37:09.267Z",
    "environment": "development"
  }
  ```

✅ **Error Handling**
- Global error handler middleware
- 404 not found handler
- Structured error responses
- Stack traces in development mode
- Comprehensive error logging

✅ **Logging System**
- Custom logger utility with levels (info, warn, error, debug)
- Timestamp prefixes on all logs
- Environment-aware debug logging
- Error metadata tracking

✅ **Graceful Shutdown**
- SIGTERM/SIGINT signal handling
- 10-second timeout for cleanup
- Unhandled rejection/exception logging

✅ **Code Quality Tools**
- ESLint with TypeScript support
- Prettier for consistent formatting
- Strict TypeScript compiler settings

---

## How to Run

### Prerequisites
- Node.js 20 or higher
- npm (comes with Node.js)

### Installation

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

### Development

Run the development server with hot reload:
```bash
npm run dev
```

The server will start on `http://0.0.0.0:8080`

### Production Build

Build the TypeScript to JavaScript:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production build |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:push` | Push schema changes to database |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser) |

---

## Environment Variables

Create a `.env` file in the `backend/` folder with these variables:

```env
PORT=8080
JWT_SECRET=your-secret-key-here
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Cloudflare R2 Configuration (Tranche 4)
CF_R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
CF_R2_ACCESS_KEY_ID=your_access_key_id
CF_R2_SECRET_ACCESS_KEY=your_secret_access_key
CF_R2_BUCKET_NAME=your_bucket_name
CF_ACCOUNT_ID=your_cloudflare_account_id
CF_R2_PUBLIC_BASE_URL=https://your-bucket.your-account-id.r2.dev  # Optional: Custom public URL

# BULI2 Integration (Tranche 6)
BULI2_API_URL=https://buli2.example.internal
BULI2_API_KEY=
BULI2_CALLBACK_URL=https://filot.example.internal/internal/reviews
AI_SCORE_THRESHOLD_AUTO_APPROVE=85
AI_SCORE_THRESHOLD_AUTO_REJECT=35
```

**Note**: `DATABASE_URL` and other PostgreSQL credentials are automatically managed by Replit's built-in database.

---

## API Endpoints

### Health Check

**GET** `/health`

Returns server health status.

**Response**:
```json
{
  "status": "ok",
  "uptime": 123,
  "timestamp": "2025-11-23T17:37:09.267Z",
  "environment": "development"
}
```

### Document Upload ✅

**POST** `/documents/upload`

Upload a document (KTP or NPWP) with authentication required.

**Headers**:
- `Authorization: Bearer <JWT_TOKEN>`
- `Content-Type: multipart/form-data`

**Request Body**:
- `type` (string): Document type - "KTP" or "NPWP"
- `file` (binary): The document file

**Success Response** (200 OK):
```json
{
  "success": true,
  "fileUrl": "https://[account-id].r2.cloudflarestorage.com/[bucket]/[user-id]/KTP_abc-123.jpg",
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "type": "KTP",
    "fileUrl": "https://...",
    "status": "uploaded",
    "createdAt": "2025-11-25T10:30:00.000Z"
  }
}
```

**For detailed API documentation**, see `backend/docs/TRANCHE_4_DOCUMENTS.md`

---

## Database Schema (Tranche 2)

### Users Table
Stores user account information and authentication details.

**Columns**: `id` (UUID), `email`, `password_hash`, `display_name`, `mobile`, `ktp_url`, `npwp_url`, `role`, `created_at`, `updated_at`

### Documents Table  
Stores uploaded documents and their processing status.

**Columns**: `id` (UUID), `user_id`, `type`, `file_url`, `status`, `result_json`, `created_at`

**For detailed database documentation**, see `backend/docs/DB_OVERVIEW.md`

---

## Tranche 5: Document Processing & OCR - ✅ COMPLETE

This phase added:

1. **OCR Integration** - Tesseract-based OCR for KTP and NPWP documents
2. **Document Processing Endpoints**
   - `POST /documents/:id/process` - Trigger OCR processing
   - `GET /documents/:id/result` - Get OCR results

---

## Tranche 6: Hybrid Verification System - ✅ COMPLETE

This phase implemented AI-powered document verification with manual review capabilities:

### New Features

1. **AI Scoring Service** (`backend/src/services/aiScoring.ts`)
   - Computes confidence score (0-100) based on parsed data quality
   - Makes automated decisions: `auto_approve`, `auto_reject`, or `needs_review`
   - Validates NIK (16 digits) and NPWP (15 digits) formats

2. **BULI2 Integration** (`backend/src/services/forwardToBuli2.ts`)
   - Forwards reviews requiring human verification to BULI2 queue
   - Includes retry logic with exponential backoff

3. **Verification Endpoints**
   - `POST /verification/evaluate` - Evaluate a processed document
   - `GET /verification/status/:documentId` - Check verification status

4. **Internal BULI2 Endpoints**
   - `POST /internal/reviews` - Accept review tasks from FiLot
   - `GET /internal/reviews/:taskId/status` - Check review status
   - `POST /internal/reviews/:taskId/decision` - Record manual decision
   - `POST /internal/reviews/:reviewId/callback` - Receive decision callbacks

5. **Database Updates**
   - New `manual_reviews` table for tracking review tasks
   - Added `verification_status`, `ai_score`, `ai_decision`, `ocr_text` to documents
   - Added `verification_status` to users

6. **Temporal Workflow Stubs** (`backend/src/temporal/`)
   - KYC Review workflow definition
   - Activity stubs for future Temporal Cloud integration

### Environment Variables

```env
BULI2_API_URL=https://buli2.example.internal
BULI2_API_KEY=
BULI2_CALLBACK_URL=https://filot.example.internal/internal/reviews
AI_SCORE_THRESHOLD_AUTO_APPROVE=85
AI_SCORE_THRESHOLD_AUTO_REJECT=35
```

### Documentation
- `backend/docs/TRANCHE_6.md` - Full architecture and API documentation
- `backend/docs/TEMPORAL.md` - Temporal integration guide
- `frontend/docs/TRANCHE_6.md` - Frontend integration guide

---

## Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript (strict mode)
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM ✅
- **Security**: Helmet, CORS
- **Logging**: Morgan + Custom Logger
- **Validation**: Zod (ready for use)
- **Auth**: JWT + bcrypt (ready for Tranche 3)
- **File Upload**: Multer (ready for Tranche 4)

---

## Project Status

✅ **Tranche 1 (Initialization)** - COMPLETE  
✅ **Tranche 2 (Database)** - COMPLETE  
✅ **Tranche 3 (Authentication)** - COMPLETE  
✅ **Tranche 4 (Document Upload & R2 Storage)** - COMPLETE  
✅ **Tranche 5 (Document Processing & OCR)** - COMPLETE  
✅ **Tranche 6 (Hybrid Verification FiLot ↔ BULI2)** - COMPLETE  
✅ **Tranche T7-A (Temporal Cloud Setup)** - COMPLETE  
✅ **Tranche T7-B (GPU OCR Worker Implementation)** - COMPLETE  
✅ **Tranche T7-C (GPU OCR Worker AWS Deployment)** - COMPLETE

---

## Tranche T7-C: GPU OCR Worker Deployment

This tranche implements the AWS ECS deployment infrastructure for the GPU OCR Worker.

### Deployment Scripts

```bash
# Full deployment pipeline
./scripts/deploy-ocr-gpu.sh all

# Individual commands
./scripts/deploy-ocr-gpu.sh build    # Build Docker image
./scripts/deploy-ocr-gpu.sh push     # Push to ECR
./scripts/deploy-ocr-gpu.sh register # Register ECS task definition
./scripts/deploy-ocr-gpu.sh update   # Update ECS service
```

### Infrastructure Files

| File | Purpose |
|------|---------|
| `/scripts/aws-ecr-setup-gpu.sh` | ECR repository and image push |
| `/scripts/build-gpu-worker.sh` | Docker image build |
| `/scripts/deploy-ocr-gpu.sh` | Deployment orchestration |
| `/infra/ecs/task-ocr-gpu.json` | ECS task definition |
| `/infra/ecs/cluster.json` | ECS cluster config |
| `/infra/ecs/service-ocr-gpu.json` | ECS service config |

### AWS Resources Required

- ECS Cluster: `filot-ocr-gpu-cluster`
- ECS Service: `filot-ocr-gpu-service`
- ECR Repository: `filot-ocr-gpu-worker`
- EC2 Instance Type: g5.xlarge (GPU-enabled)
- AWS Region: ap-southeast-2

**Full documentation**: `doc/T7C_GPU_OCR_DEPLOYMENT.md`  

---

## Notes

- This backend is **100% separate** from the Expo frontend
- The frontend currently uses AsyncStorage mock services
- Backend will be consumed via HTTP API calls
- Database is connected using PostgreSQL + Drizzle ORM ✅
- No authentication logic implemented yet (Tranche 3)
- Server binds to `0.0.0.0:8080` for accessibility
