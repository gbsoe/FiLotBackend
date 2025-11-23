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
│   ├── config/          # Environment configuration
│   ├── controllers/     # Request handlers
│   ├── routes/          # Route definitions
│   ├── middlewares/     # Express middleware
│   ├── utils/           # Shared utilities
│   ├── app.ts           # Express app factory
│   └── index.ts         # Server entry point
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
- **jsonwebtoken** (9.0.2): JWT token creation/verification (ready for auth implementation)
- **bcryptjs** (2.4.3): Password hashing library (ready for auth implementation)
- **multer** (1.4.5-lts.1): File upload middleware (ready for document uploads)
- **uuid** (9.0.1): Unique identifier generation

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