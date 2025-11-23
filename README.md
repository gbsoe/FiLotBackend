# FiLot Backend

**FiLot Backend API** - A Node.js/TypeScript backend for the FiLot mobile financial AI assistant application.

---

## Phase 1 (Initialization) - ✅ COMPLETED

This phase establishes the backend foundation without business logic or database connections.

### What Has Been Built

#### 1. Project Structure
```
backend/
├── src/
│   ├── config/
│   │   └── env.ts                 # Environment configuration
│   ├── controllers/
│   │   └── health.controller.ts   # Health check controller
│   ├── routes/
│   │   └── health.routes.ts       # Health check routes
│   ├── middlewares/
│   │   └── errorHandler.ts        # Global error handler & 404
│   ├── utils/
│   │   └── logger.ts              # Logging utility
│   ├── app.ts                     # Express app setup
│   └── index.ts                   # Server entry point
├── package.json
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
- `zod` - Schema validation (ready for use)
- `jsonwebtoken` - JWT tokens (ready for Tranche 2)
- `bcryptjs` - Password hashing (ready for Tranche 2)
- `multer` - File uploads (ready for Tranche 2)
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

---

## Environment Variables

Create a `.env` file in the `backend/` folder with these variables:

```env
PORT=8080
JWT_SECRET=your-secret-key-here
DATABASE_URL=
UPLOAD_DIR=./uploads
```

**Note**: `DATABASE_URL` is not used yet - this will be set up in Tranche 2.

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

---

## What Comes Next (Tranche 2: Database)

The next phase will add:

1. **PostgreSQL Database Connection**
   - Neon/Replit Postgres integration
   - Database schema design
   - Migration system

2. **User Management**
   - Users table (id, email, password_hash, display_name, mobile, role, created_at)
   - Profile storage (KTP/NPWP data)

3. **Authentication Endpoints**
   - `POST /auth/register` - User registration
   - `POST /auth/login` - User login (JWT tokens)
   - `POST /auth/logout` - User logout
   - `POST /auth/refresh` - Refresh JWT token
   - `POST /auth/forgot-password` - Password reset request

4. **Profile Endpoints**
   - `GET /profile` - Get user profile
   - `PUT /profile` - Update user profile
   - `PATCH /profile/password` - Change password

5. **Document Upload Endpoints**
   - `POST /documents/ktp` - Upload KTP (Indonesian ID)
   - `POST /documents/npwp` - Upload NPWP (Tax ID)

---

## Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript (strict mode)
- **Framework**: Express.js
- **Security**: Helmet, CORS
- **Logging**: Morgan + Custom Logger
- **Validation**: Zod (ready for use)
- **Auth**: JWT + bcrypt (ready for use)
- **File Upload**: Multer (ready for use)

---

## Project Status

✅ **Tranche 1 (Initialization)** - COMPLETE  
⏳ **Tranche 2 (Database)** - NOT STARTED  
⏳ **Tranche 3 (Authentication)** - NOT STARTED  
⏳ **Tranche 4 (Documents & OCR)** - NOT STARTED  
⏳ **Tranche 5 (Chat & AI)** - NOT STARTED  

---

## Notes

- This backend is **100% separate** from the Expo frontend
- The frontend currently uses AsyncStorage mock services
- Backend will be consumed via HTTP API calls
- Database connection will be added in Tranche 2
- No authentication logic implemented yet (Tranche 3)
- Server binds to `0.0.0.0:8080` for accessibility
