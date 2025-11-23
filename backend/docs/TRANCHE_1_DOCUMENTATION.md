# FiLot Backend - Tranche 1 Documentation

**Phase**: Backend Initialization  
**Date Completed**: November 23, 2025  
**Status**: ✅ Complete  
**Version**: 1.0.0

---

## Overview

Tranche 1 establishes the foundational architecture for the FiLot Backend API. This phase focuses exclusively on project initialization, tooling setup, and basic server infrastructure—**no business logic, database connections, or authentication** are implemented in this tranche.

### Objectives Achieved

1. ✅ Created organized backend folder structure
2. ✅ Initialized Node.js/TypeScript project with strict configuration
3. ✅ Installed all core dependencies (production and development)
4. ✅ Configured Express.js server with security middleware
5. ✅ Implemented health check endpoint
6. ✅ Set up comprehensive error handling and logging
7. ✅ Configured code quality tools (ESLint, Prettier)
8. ✅ Created environment configuration system
9. ✅ Documented setup and usage instructions

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts                 # Environment variable configuration
│   ├── controllers/
│   │   └── health.controller.ts   # Health check request handler
│   ├── routes/
│   │   └── health.routes.ts       # Health check route definitions
│   ├── middlewares/
│   │   └── errorHandler.ts        # Global error & 404 handlers
│   ├── utils/
│   │   └── logger.ts              # Logging utility
│   ├── app.ts                     # Express application factory
│   └── index.ts                   # Server bootstrap and entry point
├── docs/
│   └── TRANCHE_1_DOCUMENTATION.md # This file
├── dist/                          # Compiled JavaScript (generated)
├── node_modules/                  # Dependencies (generated)
├── package.json                   # Project metadata and dependencies
├── package-lock.json              # Dependency lock file (generated)
├── tsconfig.json                  # TypeScript compiler configuration
├── .eslintrc.json                 # ESLint configuration
├── .prettierrc                    # Prettier configuration
├── .env.example                   # Environment variable template
└── .gitignore                     # Git ignore rules
```

---

## Technical Implementation

### 1. TypeScript Configuration

**File**: `tsconfig.json`

**Key Features**:
- Strict mode enabled (all strict flags: `noImplicitAny`, `strictNullChecks`, etc.)
- Target: ES2020
- Module system: CommonJS
- Source maps: Enabled for debugging
- Unused code detection: Enabled
- Output directory: `./dist`
- Root directory: `./src`

**Compiler Options**:
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true
}
```

### 2. Dependencies

#### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.18.2 | Web application framework |
| `cors` | ^2.8.5 | Cross-origin resource sharing |
| `helmet` | ^7.1.0 | HTTP security headers |
| `morgan` | ^1.10.0 | HTTP request logger |
| `dotenv` | ^16.3.1 | Environment variable loader |
| `zod` | ^3.22.4 | Schema validation (ready for Tranche 2+) |
| `jsonwebtoken` | ^9.0.2 | JWT authentication (ready for Tranche 2+) |
| `bcryptjs` | ^2.4.3 | Password hashing (ready for Tranche 2+) |
| `multer` | ^1.4.5-lts.1 | File upload handling (ready for Tranche 2+) |
| `uuid` | ^9.0.1 | Unique identifier generation |

#### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.3.3 | TypeScript compiler |
| `ts-node-dev` | ^2.0.0 | Development server with hot reload |
| `eslint` | ^8.56.0 | Code linting |
| `@typescript-eslint/eslint-plugin` | ^6.16.0 | TypeScript linting rules |
| `@typescript-eslint/parser` | ^6.16.0 | TypeScript parser for ESLint |
| `prettier` | ^3.1.1 | Code formatter |
| `@types/*` | Various | TypeScript type definitions |

### 3. Express Application Architecture

#### Entry Point (`index.ts`)

**Responsibilities**:
- Bootstrap the Express application
- Start HTTP server on configured port
- Handle graceful shutdown (SIGTERM, SIGINT)
- Process-level error handling (unhandled rejections, uncaught exceptions)
- Startup logging

**Key Features**:
```typescript
// Server starts on 0.0.0.0 for accessibility
server.listen(port, '0.0.0.0', callback);

// Graceful shutdown with 10-second timeout
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Global error handlers
process.on('unhandledRejection', handler);
process.on('uncaughtException', handler);
```

#### Application Factory (`app.ts`)

**Middleware Chain** (in order):
1. `helmet()` - Security headers
2. `cors()` - CORS configuration
3. `express.json()` - JSON body parser
4. `express.urlencoded()` - URL-encoded body parser
5. `morgan()` - HTTP request logging (dev/combined mode)
6. Route handlers
7. `notFoundHandler` - 404 error handler
8. `errorHandler` - Global error handler

### 4. Logging System

**File**: `src/utils/logger.ts`

**Log Levels**:
- `info` - General information (always logged)
- `warn` - Warning messages (always logged)
- `error` - Error messages with metadata (always logged)
- `debug` - Debug information (development only)

**Format**:
```
[2025-11-23T17:37:09.267Z] [INFO] Express app initialized with middleware
[2025-11-23T17:37:09.275Z] [ERROR] Unhandled Rejection { error metadata }
```

**Features**:
- ISO 8601 timestamp prefixes
- Environment-aware debug logging
- Metadata support for structured logging
- Console-based output (easily extensible to file/service logging)

### 5. Error Handling

**File**: `src/middlewares/errorHandler.ts`

#### Global Error Handler

**Features**:
- Catches all unhandled errors
- Returns consistent JSON error responses
- Includes stack traces in development mode
- Logs error details with request context

**Response Format**:
```json
{
  "success": false,
  "error": {
    "message": "Error message here",
    "stack": "Stack trace (development only)"
  }
}
```

#### 404 Not Found Handler

**Features**:
- Catches undefined routes
- Returns helpful error message
- Includes requested method and path

**Response Format**:
```json
{
  "success": false,
  "error": {
    "message": "Route GET /undefined-path not found"
  }
}
```

### 6. Environment Configuration

**File**: `src/config/env.ts`

**Configuration Interface**:
```typescript
interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  JWT_SECRET: string;
  DATABASE_URL: string;
  UPLOAD_DIR: string;
}
```

**Default Values**:
- `PORT`: 8080
- `NODE_ENV`: development
- `JWT_SECRET`: dev-secret-change-in-production (warns if not set)
- `DATABASE_URL`: empty (not used in Tranche 1)
- `UPLOAD_DIR`: ./uploads (ready for Tranche 2+)

**Features**:
- Centralized configuration management
- Type-safe environment access
- Warning messages for missing critical variables
- Fallback defaults for development

### 7. Code Quality Tools

#### ESLint Configuration

**File**: `.eslintrc.json`

**Rules**:
- TypeScript-aware parsing
- Recommended ESLint rules
- Recommended TypeScript rules
- Warnings for explicit `any` types
- Errors for unused variables (except `_` prefix)

#### Prettier Configuration

**File**: `.prettierrc`

**Settings**:
- Semicolons: Required
- Quotes: Single
- Trailing commas: ES5
- Print width: 80 characters
- Tab width: 2 spaces
- Arrow function parentheses: Always

---

## API Endpoints

### Health Check

**Endpoint**: `GET /health`

**Description**: Returns server health status and uptime information.

**Authentication**: None required

**Request**:
```bash
curl http://localhost:8080/health
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "uptime": 123,
  "timestamp": "2025-11-23T17:37:09.267Z",
  "environment": "development"
}
```

**Response Fields**:
- `status` (string): Always "ok" if server is responding
- `uptime` (number): Server uptime in seconds (integer)
- `timestamp` (string): Current ISO 8601 timestamp
- `environment` (string): Current NODE_ENV value

**Use Cases**:
- Health monitoring and uptime checks
- Load balancer health probes
- Deployment verification
- Integration testing

---

## Running the Backend

### Prerequisites

- Node.js 20 or higher
- npm (included with Node.js)

### Installation Steps

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

4. **(Optional) Edit `.env` file**:
   ```env
   PORT=8080
   JWT_SECRET=your-secret-key-here
   DATABASE_URL=
   UPLOAD_DIR=./uploads
   ```

### Development Mode

**Start development server with hot reload**:
```bash
npm run dev
```

**Output**:
```
[INFO] ts-node-dev ver. 2.0.0 (using ts-node ver. 10.9.2, typescript ver. 5.9.3)
[2025-11-23T17:37:09.267Z] [INFO] Express app initialized with middleware
[2025-11-23T17:37:09.275Z] [INFO] FiLot Backend Server started
[2025-11-23T17:37:09.276Z] [INFO] Environment: development
[2025-11-23T17:37:09.276Z] [INFO] Port: 8080
[2025-11-23T17:37:09.276Z] [INFO] Health check: http://0.0.0.0:8080/health
```

**Features**:
- Automatic restart on file changes
- Transpile-only mode (faster compilation)
- Full TypeScript error reporting
- Morgan HTTP logging

### Production Build

**Compile TypeScript to JavaScript**:
```bash
npm run build
```

**Output**: Compiled files in `./dist/` directory

**Start production server**:
```bash
npm start
```

**Features**:
- Runs compiled JavaScript (faster startup)
- Production-optimized logging
- No source file watching

### Code Quality Commands

**Run ESLint**:
```bash
npm run lint
```

**Format code with Prettier**:
```bash
npm run format
```

---

## Testing the Backend

### Manual Testing

**Test health endpoint**:
```bash
curl http://localhost:8080/health
```

**Expected response**:
```json
{"status":"ok","uptime":50,"timestamp":"2025-11-23T17:37:59.574Z","environment":"development"}
```

**Test 404 handler**:
```bash
curl http://localhost:8080/undefined-route
```

**Expected response** (404):
```json
{"success":false,"error":{"message":"Route GET /undefined-route not found"}}
```

### Automated Testing

**Note**: Automated tests are not included in Tranche 1. Testing infrastructure (Jest, Supertest) will be added in future tranches.

---

## Security Considerations

### Implemented Security Measures

1. **Helmet.js**:
   - Sets secure HTTP headers
   - Prevents common vulnerabilities (XSS, clickjacking, etc.)
   - Configured with default security policies

2. **CORS**:
   - Cross-origin requests enabled
   - Allows frontend integration from any origin (development mode)
   - Should be restricted to specific origins in production

3. **Error Handling**:
   - Stack traces only in development mode
   - Generic error messages in production
   - No sensitive data leakage in error responses

4. **Environment Variables**:
   - Sensitive configuration (JWT_SECRET) in environment files
   - `.env` excluded from version control via `.gitignore`
   - `.env.example` template for documentation

### Future Security Enhancements (Tranche 2+)

- JWT token authentication
- Password hashing with bcrypt
- Rate limiting
- Input validation with Zod
- SQL injection prevention (parameterized queries)
- File upload restrictions (size, type, sanitization)
- Production CORS restrictions

---

## What Was NOT Implemented (By Design)

The following features are **intentionally excluded** from Tranche 1:

- ❌ Database connection (PostgreSQL/Neon)
- ❌ User authentication endpoints (login, register, logout)
- ❌ JWT token generation and validation
- ❌ Password hashing
- ❌ User profile management
- ❌ Document upload endpoints (KTP/NPWP)
- ❌ Chat message handling
- ❌ External API integrations (BULI2, DeFi, Alpha)
- ❌ Email service integration
- ❌ Session management
- ❌ Automated testing
- ❌ Database migrations
- ❌ API versioning

These features will be implemented in subsequent tranches.

---

## Known Limitations

1. **CORS Configuration**: Currently allows all origins (development mode). Should be restricted in production.

2. **Environment Defaults**: Uses development defaults for missing environment variables. Production deployment requires explicit configuration.

3. **Logging**: Console-based logging only. Production deployments may require structured logging to external services.

4. **No Health Checks for Dependencies**: Health endpoint doesn't verify database or external service connectivity (no dependencies yet).

5. **No Request Validation**: Request body validation infrastructure (Zod) is installed but not implemented.

---

## Next Steps (Tranche 2: Database Integration)

### Planned Features

1. **PostgreSQL Database Setup**:
   - Neon/Replit PostgreSQL connection
   - Connection pooling configuration
   - Database health monitoring

2. **Database Schema**:
   - Users table (id, email, password_hash, display_name, mobile, role, created_at, updated_at)
   - Sessions table (for JWT token management)
   - Documents table (KTP/NPWP metadata)

3. **Migration System**:
   - Database migration tool (Drizzle ORM or similar)
   - Version-controlled schema changes
   - Rollback capability

4. **Database Utilities**:
   - Database connection module
   - Query helpers
   - Transaction support

### Dependencies Required

- PostgreSQL client library
- ORM/Query builder (Drizzle, Prisma, or TypeORM)
- Migration tooling

---

## Troubleshooting

### Server Won't Start

**Problem**: Server fails to start or crashes immediately

**Solutions**:
1. Check if port 8080 is already in use:
   ```bash
   lsof -i :8080
   ```
2. Verify Node.js version:
   ```bash
   node --version  # Should be 20.x or higher
   ```
3. Clear and reinstall dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### TypeScript Compilation Errors

**Problem**: Build fails with TypeScript errors

**Solutions**:
1. Run TypeScript compiler with verbose output:
   ```bash
   npx tsc --noEmit
   ```
2. Check `tsconfig.json` is present and valid
3. Verify all `@types/*` packages are installed

### Hot Reload Not Working

**Problem**: Changes don't trigger server restart in dev mode

**Solutions**:
1. Ensure using `npm run dev` (not `npm start`)
2. Check `ts-node-dev` is installed in `devDependencies`
3. Try restarting the dev server manually

### Health Endpoint Returns 404

**Problem**: `/health` endpoint not accessible

**Solutions**:
1. Verify server is running:
   ```bash
   curl http://localhost:8080/health
   ```
2. Check server logs for startup errors
3. Ensure routes are properly registered in `app.ts`

---

## File Reference

### Configuration Files

| File | Purpose | Key Settings |
|------|---------|--------------|
| `package.json` | Project metadata, dependencies, scripts | Scripts: dev, build, start, lint, format |
| `tsconfig.json` | TypeScript compiler configuration | Strict mode, ES2020 target, CommonJS modules |
| `.eslintrc.json` | ESLint rules | TypeScript parser, recommended rules |
| `.prettierrc` | Code formatting rules | Single quotes, 2-space indentation |
| `.env.example` | Environment variable template | PORT, JWT_SECRET, DATABASE_URL, UPLOAD_DIR |
| `.gitignore` | Git exclusion rules | node_modules/, dist/, .env, uploads/ |

### Source Files

| File | Purpose | Exports |
|------|---------|---------|
| `src/index.ts` | Server entry point | None (executes startServer) |
| `src/app.ts` | Express app factory | `createApp()` function |
| `src/config/env.ts` | Environment configuration | `config` object |
| `src/utils/logger.ts` | Logging utility | `logger` object |
| `src/middlewares/errorHandler.ts` | Error handlers | `errorHandler`, `notFoundHandler` |
| `src/routes/health.routes.ts` | Health route definitions | Express Router |
| `src/controllers/health.controller.ts` | Health endpoint handler | `getHealth()` function |

---

## Changelog

### Version 1.0.0 (November 23, 2025)

**Added**:
- Initial project structure
- TypeScript configuration with strict mode
- Express.js server with security middleware
- Health check endpoint
- Global error handling
- Logging system
- Environment configuration
- Code quality tools (ESLint, Prettier)
- Documentation (README.md, this file)

**Status**: ✅ Tranche 1 Complete

---

## License

MIT License

---

## Contact & Support

For questions about this implementation:
- Review the main `README.md` in the backend directory
- Check the source code comments
- Refer to the frontend audit document for integration requirements

---

**End of Tranche 1 Documentation**
