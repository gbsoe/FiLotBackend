# TRANCHE 2 REPORT: Database & User Schema

**Date**: November 23, 2025  
**Phase**: Tranche 2 - Database Integration  
**Status**: ✅ COMPLETED

---

## Executive Summary

Tranche 2 has been successfully completed. The FiLot Backend now has a fully functional PostgreSQL database connection using Drizzle ORM with type-safe database operations. The user and document schemas have been created and migrated to the database.

---

## Installed Packages

The following npm packages were installed to support database functionality:

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `drizzle-orm` | ^0.44.7 | Type-safe ORM for PostgreSQL |
| `drizzle-kit` | ^0.31.7 | Database migration toolkit and CLI |
| `pg` | ^8.16.3 | PostgreSQL client for Node.js |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/pg` | ^8.15.6 | TypeScript type definitions for pg |

All packages were installed successfully without errors.

---

## Created Schema

### 1. Users Table

The `users` table stores all user account information and authentication details.

**Table Name**: `users`

**Schema Definition**:
```typescript
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 255 }),
  mobile: varchar("mobile", { length: 50 }),
  ktpUrl: text("ktp_url"),
  npwpUrl: text("npwp_url"),
  role: varchar("role", { length: 50 }).default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**Columns**:
- `id` (UUID, PRIMARY KEY, auto-generated)
- `email` (VARCHAR 255, UNIQUE, NOT NULL) - User email address
- `password_hash` (TEXT, NOT NULL) - Bcrypt hashed password
- `display_name` (VARCHAR 255, NULLABLE) - User's display name
- `mobile` (VARCHAR 50, NULLABLE) - Mobile phone number
- `ktp_url` (TEXT, NULLABLE) - URL to KTP (ID card) document
- `npwp_url` (TEXT, NULLABLE) - URL to NPWP (tax ID) document
- `role` (VARCHAR 50, DEFAULT 'user') - User role (user, admin)
- `created_at` (TIMESTAMP, DEFAULT NOW()) - Account creation time
- `updated_at` (TIMESTAMP, DEFAULT NOW()) - Last update time

### 2. Documents Table

The `documents` table stores uploaded documents and their processing status.

**Table Name**: `documents`

**Schema Definition**:
```typescript
export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  fileUrl: text("file_url"),
  status: varchar("status", { length: 50 }).default("pending"),
  resultJson: text("result_json"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Columns**:
- `id` (UUID, PRIMARY KEY, auto-generated)
- `user_id` (UUID, NOT NULL, FOREIGN KEY → users.id) - Reference to users table
- `type` (VARCHAR 50, NOT NULL) - Document type (KTP, NPWP, OTHER)
- `file_url` (TEXT, NULLABLE) - URL to uploaded file
- `status` (VARCHAR 50, DEFAULT 'pending') - Processing status
- `result_json` (TEXT, NULLABLE) - JSON result from BULI2 processing
- `created_at` (TIMESTAMP, DEFAULT NOW()) - Upload timestamp

**Foreign Key Constraint**: `documents.user_id` references `users.id` with `ON DELETE no action ON UPDATE no action` to ensure referential integrity.

---

## Migration Results

### Migration Generation

**Command**: `npm run db:generate`

**Initial Output**:
```
2 tables
documents 7 columns 0 indexes 0 fks
users 10 columns 0 indexes 0 fks

[✓] Your SQL migration file ➜ src/db/migrations/0000_strong_ben_urich.sql 🚀
```

**After Adding Foreign Key Constraint**:
```
2 tables
documents 7 columns 0 indexes 1 fks
users 10 columns 0 indexes 0 fks

[✓] Your SQL migration file ➜ src/db/migrations/0001_lively_wild_child.sql 🚀
```

**Status**: ✅ SUCCESS

### Schema Push

**Command**: `npm run db:push`

**Output**:
```
Using 'pg' driver for database querying
[✓] Pulling schema from database...
[✓] Changes applied
```

**Status**: ✅ SUCCESS

### Migration Files

Two migration files were generated:

1. **`src/db/migrations/0000_strong_ben_urich.sql`** - Initial schema creation
   - Creates `users` table with all columns
   - Creates `documents` table with all columns
   - Adds unique constraint on `users.email`

2. **`src/db/migrations/0001_lively_wild_child.sql`** - Foreign key constraint
   - Adds foreign key constraint from `documents.user_id` to `users.id`
   - Ensures referential integrity between tables

---

## Folder Structure

The following folder structure was created for database functionality:

```
backend/
├── src/
│   └── db/                           # Database layer
│       ├── schema.ts                 # Drizzle ORM schema definitions
│       ├── index.ts                  # Database connection setup
│       ├── utils.ts                  # Database utility functions
│       └── migrations/               # Generated migration files
│           ├── 0000_strong_ben_urich.sql
│           └── 0001_lively_wild_child.sql
├── docs/
│   ├── TRANCHE_1_DOCUMENTATION.md    # Phase 1 documentation
│   ├── DB_OVERVIEW.md                # Database documentation
│   └── TRANCHE_2_REPORT.md           # This report
└── drizzle.config.ts                 # Drizzle Kit configuration
```

### File Descriptions

#### `backend/src/db/schema.ts`
- Contains Drizzle ORM schema definitions for `users` and `documents` tables
- Uses TypeScript for type safety
- Follows PostgreSQL naming conventions (snake_case)

#### `backend/src/db/index.ts`
- Establishes PostgreSQL connection using `pg` Pool
- Exports Drizzle ORM instance for use throughout the application
- Uses `DATABASE_URL` environment variable for connection

#### `backend/src/db/utils.ts`
- Contains `mapUser()` utility function
- Converts database rows (snake_case) to application objects (camelCase)
- Handles null/undefined values safely

#### `backend/drizzle.config.ts`
- Configures Drizzle Kit for migrations
- Specifies schema location, migration output directory, and database credentials
- Uses PostgreSQL dialect

---

## Environment Configuration

### Environment Variables Used

All PostgreSQL connection details are automatically managed by Replit's built-in database:

- `DATABASE_URL` - Full PostgreSQL connection string
- `PGHOST` - PostgreSQL host
- `PGPORT` - PostgreSQL port (default: 5432)
- `PGUSER` - PostgreSQL username
- `PGPASSWORD` - PostgreSQL password
- `PGDATABASE` - Database name

These variables are set automatically by Replit and do not need manual configuration.

---

## Package.json Scripts Added

Three new scripts were added to `package.json` for database operations:

| Script | Command | Purpose |
|--------|---------|---------|
| `db:generate` | `drizzle-kit generate` | Generate migration files from schema |
| `db:push` | `drizzle-kit push` | Push schema changes to database |
| `db:studio` | `drizzle-kit studio` | Open Drizzle Studio (visual DB browser) |

---

## Errors Encountered

### Minor LSP Warning

**Issue**: TypeScript LSP reports "Cannot find name 'process'" in `drizzle.config.ts`

**File**: `backend/drizzle.config.ts`

**Reason**: The config file is in the backend root directory, outside the main TypeScript compilation context.

**Impact**: ⚠️ MINIMAL - This is a cosmetic LSP warning only. The file works correctly when executed by drizzle-kit CLI, which has access to Node.js globals.

**Resolution**: Not required. The drizzle-kit CLI executes this file correctly despite the LSP warning.

**Status**: Safe to ignore

### No Other Errors

All other operations completed successfully without errors:
- ✅ Package installation
- ✅ Database connection
- ✅ Schema generation
- ✅ Migration push
- ✅ File creation

---

## Documentation Created

The following documentation files were created or updated:

### 1. `backend/docs/DB_OVERVIEW.md` (NEW)
Comprehensive database documentation including:
- Database structure overview
- Detailed table schemas
- Migration process instructions
- Environment variable requirements
- Testing commands
- Utility function documentation

### 2. `README.md` (UPDATED)
Main project README updated with:
- Phase 2 (Database) completion status
- Updated project structure showing `db/` folder
- Database dependencies listed
- New npm scripts for database operations
- Database schema summary
- Updated tech stack information
- Updated project status to show Tranche 2 complete

### 3. `backend/docs/TRANCHE_2_REPORT.md` (THIS FILE)
Complete report of Tranche 2 implementation

---

## Testing & Verification

### Database Connection Test

The PostgreSQL database is accessible and operational:

```bash
# Connection verified via drizzle-kit push command
# Tables created successfully
# Schema matches definitions
```

### Schema Verification

Both tables were created successfully:
- ✅ `users` table with 10 columns
- ✅ `documents` table with 7 columns

---

## Next Steps (Tranche 3)

The following features are planned for Tranche 3:

### 1. Authentication Implementation
- User registration with email/password
- User login with JWT token generation
- Password hashing with bcryptjs
- Token refresh mechanism
- Password reset functionality

### 2. Authentication Routes
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `POST /auth/refresh` - Refresh token
- `POST /auth/forgot-password` - Password reset request

### 3. Profile Management
- `GET /profile` - Get user profile
- `PUT /profile` - Update user profile
- `PATCH /profile/password` - Change password

### 4. Middleware
- JWT authentication middleware
- Request validation middleware (using Zod)
- Role-based authorization middleware

### 5. Database Enhancements
- Add foreign key constraints
- Add indexes for performance
- Implement database seeding for testing

---

## Summary

**Tranche 2 Status**: ✅ COMPLETE

All objectives have been achieved:
- ✅ PostgreSQL database created and connected
- ✅ Drizzle ORM installed and configured
- ✅ User and document schemas defined and migrated
- ✅ Database utilities created
- ✅ Migration system working
- ✅ Documentation complete
- ✅ README updated

The FiLot Backend now has a solid database foundation ready for authentication and business logic implementation in subsequent tranches.

---

## Technical Metrics

| Metric | Value |
|--------|-------|
| New packages installed | 4 |
| New files created | 6 |
| Database tables created | 2 |
| Total columns | 17 |
| Migration files generated | 1 |
| Documentation pages | 2 |
| npm scripts added | 3 |

| Errors encountered | 0 (1 minor LSP warning) |

---

**Report Generated**: November 23, 2025  
**Prepared By**: Replit Agent  
**Tranche**: 2 - Database & User Schema  
**Status**: ✅ COMPLETED
