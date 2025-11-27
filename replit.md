# FiLot Backend - Replit Configuration

## Overview
FiLot Backend is a Node.js/TypeScript REST API server for the FiLot mobile financial AI assistant. It provides secure authentication, user profile management, Indonesian document processing (KTP/NPWP OCR), conversational AI chat, and integration with external financial services. The project aims to deliver a robust, scalable, and secure backend solution for personal finance management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
The backend uses Node.js with TypeScript and Express.js. It features a layered architecture for modularity and maintainability.

### Security Architecture
Security is a core focus, utilizing:
- **Helmet.js** for secure HTTP headers.
- **CORS hardening** restricted to the FiLot frontend.
- **JWT-based authentication** for user routes.
- **Service key authentication** for internal routes.
- **Rate limiting** (global and sensitive routes).
- **File validation** (magic-number, MIME, size limits).
- **Presigned URLs** for secure access to private R2 bucket documents.
- Password hashing with bcryptjs and Zod for input validation.

### Error Handling & Logging
A centralized global error handler, a 404 handler, and a custom logger ensure consistent error responses and effective debugging. Morgan middleware is used for HTTP request logging.

### Configuration Management
Environment variables are loaded via `dotenv`, with type-safe configuration ensuring robust deployments.

### Code Quality
ESLint, Prettier, and strict TypeScript compiler flags enforce high code quality and consistency.

### File Upload and Document Processing
- Supports JPEG, PNG, PDF files up to 5MB via Multer.
- Files are stored in a private R2 bucket, accessed via time-limited presigned URLs.
- Integrates Tesseract OCR for Indonesian document processing (KTP/NPWP).
- Features an asynchronous processing pipeline with Redis-based or Temporal-based queuing.

### Hybrid Verification System
Combines AI-powered scoring with manual review capabilities:
- **AI Scoring Engine**: Computes confidence scores (0-100) for KTP/NPWP based on completeness and format validation.
  - Documents with scores ≥85 are `auto_approved`.
  - Documents with scores <35 are `auto_reject`.
  - Documents with scores between 35 and 85 are `needs_review`.
- **Hybrid Decision Engine**: Determines verification path (`auto_approved` or `pending_manual_review`).
- **BULI2 Integration**: Documents requiring manual review are escalated to the BULI2 review service.
- **Secure Download Route**: Provides authenticated, owner-specific access to processed documents via presigned URLs.
- **Documents Table Schema**: Includes fields for `ai_score`, `ai_decision`, `verification_status`, `buli2_ticket_id`, and `processed_at`.

## External Dependencies

### Production Dependencies
- **express**: Web framework.
- **express-rate-limit**: Rate limiting.
- **cors**: CORS middleware.
- **helmet**: Security headers.
- **morgan**: HTTP request logging.
- **dotenv**: Environment variables.
- **zod**: Schema validation.
- **jsonwebtoken**, **jose**: JWT handling.
- **bcryptjs**: Password hashing.
- **multer**: File uploads.
- **@aws-sdk/client-s3**, **@aws-sdk/s3-request-presigner**: Cloudflare R2 storage.
- **mime-types**: MIME type detection.
- **uuid**: Unique IDs.
- **drizzle-orm**, **pg**: PostgreSQL ORM and client.
- **node-tesseract-ocr**: Tesseract OCR wrapper.
- **redis**: Redis client for queuing.
- **@temporalio/proto**, **@temporalio/workflow**: Temporal SDK.

### External Service Integrations
- **BULI2 Review Service**: For manual document review.
- **Temporal Cloud**: For durable workflow execution (future KYC review process).
- **FiLot DeFi API**: For decentralized finance operations.
- **Project Alpha API**: For additional financial services.