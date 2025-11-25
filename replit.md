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

### Future External Service Integrations
- **BULI2 OCR Service**: For Indonesian document processing.
- **FiLot DeFi API**: For decentralized finance operations.
- **Project Alpha API**: For additional financial services.
- **Email Service**: For password resets and notifications.
- **Session Store**: Potentially Redis for token management.