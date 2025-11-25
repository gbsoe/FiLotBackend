# FiLot Backend - Replit Configuration

## Overview

FiLot Backend is a Node.js/TypeScript REST API server designed to support the FiLot mobile financial AI assistant application. The backend provides authentication, user profile management, Indonesian document processing (KTP/NPWP OCR), conversational AI chat capabilities, and integration with external financial services APIs.

The application is built with Express.js and follows a modular architecture with strict TypeScript enforcement, comprehensive error handling, and security-first middleware configuration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Framework & Runtime
- **Runtime**: Node.js with TypeScript (strict mode enabled)
- **Web Framework**: Express.js 4.x
- **Module System**: CommonJS with ES2020 target compilation
- **Development Workflow**: Hot-reload via ts-node-dev for local development, compiled to JavaScript for production

**Rationale**: Express provides a mature, well-documented foundation for REST APIs. TypeScript's strict mode catches errors at compile-time and improves code maintainability. The dual-mode development approach (transpile-only during dev, full compilation for production) balances developer experience with deployment reliability.

### Security Architecture
- **HTTP Security**: Helmet.js for setting secure HTTP headers
- **CORS**: Configured to allow cross-origin requests from the mobile frontend
- **Authentication**: JWT-based token system (infrastructure ready, implementation pending)
- **Password Security**: bcryptjs for password hashing (infrastructure ready)
- **Input Validation**: Zod schema validation library included for request validation

**Rationale**: Defense-in-depth approach with multiple security layers. JWT tokens enable stateless authentication suitable for mobile clients. Helmet prevents common web vulnerabilities. Zod provides runtime type safety beyond TypeScript's compile-time checks.

### Error Handling & Logging
- **Global Error Handler**: Centralized middleware catches all unhandled errors
- **404 Handler**: Dedicated handler for undefined routes
- **Logging**: Custom logger utility with timestamp-prefixed console output
- **HTTP Logging**: Morgan middleware for request/response logging (dev mode: detailed, production: standard combined format)
- **Process-Level Handlers**: Graceful shutdown on SIGTERM/SIGINT, logging for unhandled rejections and uncaught exceptions

**Rationale**: Centralized error handling ensures consistent error responses and prevents information leakage. Structured logging aids debugging. Graceful shutdown prevents data corruption during deployment updates.

### Project Structure
```
backend/
├── src/
│   ├── auth/            # Authentication logic (NEW)
│   │   ├── stackAuth.ts # Stack Auth JWT verification & token refresh
│   │   ├── jwt.ts       # Bearer token extraction utilities
│   │   └── middleware.ts # Auth middleware
│   ├── config/          # Environment configuration
│   ├── controllers/     # Request handlers
│   ├── db/              # Database layer (NEW)
│   │   ├── schema.ts    # Drizzle ORM schema definitions
│   │   ├── index.ts     # Database connection
│   │   ├── utils.ts     # Database utilities
│   │   └── migrations/  # Database migration files
│   ├── routes/          # Route definitions
│   │   ├── health.routes.ts
│   │   ├── authRoutes.ts    # Auth endpoints (NEW)
│   │   └── profileRoutes.ts # Profile endpoints (NEW)
│   ├── types/           # TypeScript type definitions (NEW)
│   │   └── User.ts
│   ├── middlewares/     # Express middleware
│   ├── utils/           # Shared utilities
│   ├── app.ts           # Express app factory
│   └── index.ts         # Server entry point
├── docs/                # Documentation
│   ├── TRANCHE_1_DOCUMENTATION.md
│   ├── TRANCHE_2_REPORT.md
│   ├── TRANCHE_3_REPORT.md  # Auth implementation details (NEW)
│   └── DB_OVERVIEW.md
├── dist/                # Compiled JavaScript (build output)
└── uploads/             # File upload directory (future use)
```

**Rationale**: Layer-based architecture separates concerns. Routes define endpoints, controllers handle business logic, middleware manages cross-cutting concerns. This structure scales well as features are added and makes testing straightforward.

### Configuration Management
- **Environment Variables**: Loaded via dotenv from `.env` file
- **Type-Safe Config**: Centralized `config/env.ts` with EnvConfig interface
- **Default Values**: Fallback defaults for development (e.g., PORT=8080, NODE_ENV=development)
- **Missing Variable Warnings**: Console warnings for unset required variables

**Rationale**: Environment-based configuration enables different settings per deployment environment without code changes. Type safety prevents runtime errors from misconfigured values. Warning system alerts developers to configuration issues early.

### Code Quality & Standards
- **ESLint**: TypeScript-aware linting with recommended rules
- **Prettier**: Automated code formatting
- **Strict TypeScript**: All strict compiler flags enabled (noImplicitAny, strictNullChecks, etc.)
- **Unused Code Detection**: Compiler flags catch unused locals/parameters/imports

**Rationale**: Automated tooling ensures consistent code style across the team. Strict TypeScript settings catch bugs early. ESLint prevents common anti-patterns.

### File Upload Handling
- **Library**: Multer (installed, not yet configured)
- **Storage Location**: Configurable via UPLOAD_DIR environment variable (defaults to `backend/uploads/`)

**Rationale**: Multer is the standard Express middleware for multipart/form-data. Local filesystem storage is simple for initial implementation; can be swapped for S3/cloud storage later without changing upload logic.

## External Dependencies

### Production Dependencies
- **express** (4.18.2): Web application framework
- **cors** (2.8.5): Cross-origin resource sharing middleware
- **helmet** (7.1.0): Security headers middleware
- **morgan** (1.10.0): HTTP request logger
- **dotenv** (16.3.1): Environment variable loader
- **zod** (3.22.4): TypeScript-first schema validation
- **jsonwebtoken** (9.0.2): JWT token creation/verification
- **jose** (latest): Modern JWT verification with JWKS support (Stack Auth integration)
- **bcryptjs** (2.4.3): Password hashing library
- **multer** (1.4.5-lts.1): File upload middleware ✅
- **@aws-sdk/client-s3**: S3-compatible storage client for Cloudflare R2 ✅
- **@aws-sdk/s3-request-presigner**: Signed URL generation ✅
- **mime-types**: MIME type detection and extension mapping ✅
- **uuid** (9.0.1): Unique identifier generation
- **drizzle-orm** (0.44.7): TypeScript ORM for SQL databases
- **pg** (8.16.3): PostgreSQL client for Node.js

### Development Dependencies
- **typescript** (5.3.3): TypeScript compiler
- **ts-node-dev** (2.0.0): Development server with hot reload
- **@types/** packages: Type definitions for Node.js, Express, and all libraries
- **@typescript-eslint/eslint-plugin** (6.16.0): TypeScript linting rules
- **@typescript-eslint/parser** (6.16.0): ESLint TypeScript parser
- **eslint** (8.56.0): JavaScript/TypeScript linter
- **prettier** (3.1.1): Code formatter

### Future External Service Integrations
Based on frontend requirements, the backend will integrate with:

1. **Database**: PostgreSQL (not yet connected) - Will store users, profiles, sessions, chat history, documents
2. **BULI2 OCR Service**: Indonesian document (KTP/NPWP) processing API
3. **FiLot DeFi API**: Decentralized finance operations
4. **Project Alpha API**: Additional financial services
5. **Email Service**: For password reset and notifications (provider TBD)
6. **Session Store**: Likely Redis for JWT token blacklisting/refresh tokens

**Note**: Database infrastructure (Drizzle ORM mentioned in specifications) is expected to be added in future development phases. The current architecture supports adding Drizzle with any SQL database backend.

## Development Progress

### ✅ Tranche 1 - Backend Initialization (COMPLETED)
**Date Completed**: November 23, 2025

**Achievements**:
- Created organized backend folder structure
- Initialized Node.js/TypeScript project with strict configuration
- Installed all core dependencies (express, cors, helmet, morgan, zod, jsonwebtoken, bcryptjs, multer, uuid)
- Configured Express.js server with security middleware (CORS, Helmet)
- Implemented health check endpoint (GET /health)
- Set up comprehensive error handling and logging systems
- Configured code quality tools (ESLint, Prettier)
- Created environment configuration system
- Documented setup and usage in README.md
- Created comprehensive technical documentation in `backend/docs/TRANCHE_1_DOCUMENTATION.md`

**Endpoints Available**:
- `GET /health` - Returns server status, uptime, timestamp, and environment

**Server Status**: Running on port 8080 (workflow: "Backend Server")

**Documentation**: See `backend/docs/TRANCHE_1_DOCUMENTATION.md` for complete technical details

### ✅ Tranche 2 - Database Integration (COMPLETED)
**Date Completed**: November 23, 2025

**Achievements**:
- PostgreSQL database provisioned and connected (Replit Database)
- Drizzle ORM configured with TypeScript
- Database schema created (users and documents tables)
- Database migrations system set up
- Connection pooling configured with pg library

**Documentation**: See `backend/docs/TRANCHE_2_REPORT.md` and `backend/docs/DB_OVERVIEW.md` for complete technical details

### ✅ Tranche 3 - Authentication & Profile (COMPLETED)
**Date Completed**: November 24, 2025

**Achievements**:
- Stack Auth integration with JWT verification via JWKS
- Automatic user creation/linking on first authentication  
- Token refresh mechanism via Stack Auth API
- Authentication middleware protecting routes
- Profile management endpoints (GET/PUT /profile)
- Database schema updated for OAuth provider support (providerId, providerType)
- Type-safe implementation with comprehensive error handling
- Installed jose library for modern JWT verification

**New Endpoints**:
- `POST /auth/verify` - Verify Stack Auth access token and auto-create user
- `POST /auth/refresh` - Refresh access token using refresh token
- `GET /profile` - Retrieve authenticated user's profile (protected)
- `PUT /profile` - Update user profile fields (protected)

**Documentation**: See `backend/docs/TRANCHE_3_REPORT.md` for complete authentication flow, API documentation, and security details

**Server Status**: Running on port 8080 with all authentication routes active

### ✅ Tranche 4 - Document Upload & R2 Storage (COMPLETED)
**Date Completed**: November 25, 2025

**Achievements**:
- Cloudflare R2 (S3-compatible) storage integration
- Document upload endpoint with authentication (POST /documents/upload)
- File validation (MIME type, extension, 10MB size limit)
- Support for KTP and NPWP document types
- Database integration with automatic status tracking
- Comprehensive security considerations and documentation
- Future-ready for OCR processing pipeline

**New Endpoints**:
- `POST /documents/upload` - Upload KTP/NPWP documents (authenticated, with file validation)

**New Services**:
- R2 Storage Service (`backend/src/services/r2Storage.ts`) - S3-compatible upload/delete operations
- Documents Controller (`backend/src/controllers/documentsController.ts`) - Upload handling with validation

**Environment Variables Added**:
- `CF_R2_ENDPOINT` - Cloudflare R2 endpoint URL
- `CF_R2_ACCESS_KEY_ID` - R2 access key ID
- `CF_R2_SECRET_ACCESS_KEY` - R2 secret access key
- `CF_R2_BUCKET_NAME` - R2 bucket name
- `CF_ACCOUNT_ID` - Cloudflare account ID
- `CF_R2_PUBLIC_BASE_URL` - Public URL base (optional, with fallback)

**Documentation**: See `backend/docs/TRANCHE_4_DOCUMENTS.md` for complete API documentation, security considerations, and setup instructions

**Server Status**: Running on port 8080 with document upload functionality active

### ⏳ Tranche 5 - Document Processing & OCR (PENDING)
**Planned Features**:
- OCR integration for KTP/NPWP text extraction
- Document processing endpoints
- Data validation and parsing
- Future enhancements: magic number validation, virus scanning

### ⏳ Tranche 6 - Chat & AI (PENDING)
**Planned Features**:
- Chat message persistence
- WebSocket/SSE for real-time responses
- Integration with BULI2, FiLot DeFi, and Project Alpha APIs
- Intent routing and response streaming