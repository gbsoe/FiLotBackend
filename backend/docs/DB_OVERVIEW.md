# Database Overview - FiLot Backend

## Database Structure

FiLot Backend uses **PostgreSQL** (Neon-hosted) as the primary database, managed through **Drizzle ORM** for type-safe database operations.

---

## Tables

### 1. **users**

Stores user account information and authentication details.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique user identifier |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | User email address |
| `password_hash` | TEXT | NOT NULL | Bcrypt-hashed password |
| `display_name` | VARCHAR(255) | NULLABLE | User's display name |
| `mobile` | VARCHAR(50) | NULLABLE | Mobile phone number |
| `ktp_url` | TEXT | NULLABLE | URL to KTP (ID card) document |
| `npwp_url` | TEXT | NULLABLE | URL to NPWP (tax ID) document |
| `role` | VARCHAR(50) | DEFAULT 'user' | User role (user, admin) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

### 2. **documents**

Stores uploaded documents and their processing status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique document identifier |
| `user_id` | UUID | NOT NULL, FOREIGN KEY → users(id) | Reference to users table |
| `type` | VARCHAR(50) | NOT NULL | Document type (KTP, NPWP, OTHER) |
| `file_url` | TEXT | NULLABLE | URL to uploaded file |
| `status` | VARCHAR(50) | DEFAULT 'pending' | Processing status |
| `result_json` | TEXT | NULLABLE | JSON result from BULI2 processing |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Upload timestamp |

**Foreign Key Relationship**: `documents.user_id` references `users.id` with `ON DELETE no action ON UPDATE no action`

---

## Table Relationships

### documents → users
- **Foreign Key**: `documents.user_id` → `users.id`
- **Type**: One-to-Many (one user can have many documents)
- **Delete Behavior**: `ON DELETE no action` - Prevents deletion of users with associated documents
- **Update Behavior**: `ON UPDATE no action` - Maintains referential integrity

---

## Migration Process

### Initial Setup

The database schema is defined in `src/db/schema.ts` using Drizzle ORM's declarative syntax.

### Running Migrations

**Generate migration files:**
```bash
npm run db:generate
```

**Push schema to database:**
```bash
npm run db:push
```

**Force push (if needed):**
```bash
npm run db:push --force
```

**Open Drizzle Studio (visual database browser):**
```bash
npm run db:studio
```

### Migration Files

Generated migration files are stored in:
```
src/db/migrations/
```

These files contain the SQL statements to create and modify database tables.

---

## Environment Variables

The following environment variables are required for database connection:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |
| `PGHOST` | PostgreSQL host | `localhost` |
| `PGPORT` | PostgreSQL port | `5432` |
| `PGUSER` | PostgreSQL username | `postgres` |
| `PGPASSWORD` | PostgreSQL password | `password` |
| `PGDATABASE` | Database name | `filot_db` |

These are automatically managed by Replit when using the built-in PostgreSQL database.

---

## Database Connection

The database connection is established in `src/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);
```

---

## Utility Functions

Helper functions for data mapping are provided in `src/db/utils.ts`:

### `mapUser(row: any)`

Converts database row to application user object, mapping snake_case database columns to camelCase properties.

**Input:** Database row object  
**Output:** User object with camelCase properties  
**Returns:** `null` if row is undefined/null

---

## Testing Commands

### Check database connection:
```bash
psql $DATABASE_URL -c "SELECT version();"
```

### List all tables:
```bash
psql $DATABASE_URL -c "\dt"
```

### Query users table:
```bash
psql $DATABASE_URL -c "SELECT * FROM users;"
```

### Query documents table:
```bash
psql $DATABASE_URL -c "SELECT * FROM documents;"
```

---

## Important Notes

1. **Never modify migration files manually** - Always use `npm run db:generate` to create migrations
2. **Schema changes** - Update `src/db/schema.ts` and run `npm run db:push` to apply changes
3. **Type safety** - Drizzle ORM provides full TypeScript type inference for database operations
4. **Connection pooling** - The PostgreSQL connection pool is automatically managed by the `pg` library
5. **Environment** - Database credentials are managed through environment variables

---

## Next Steps (Future Tranches)

- Add foreign key relationships between tables
- Implement database seeding for testing
- Add indexes for performance optimization
- Set up database backup strategy
- Implement soft deletes for users and documents
