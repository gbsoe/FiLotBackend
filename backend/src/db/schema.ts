import { pgTable, text, varchar, timestamp, uuid, pgEnum, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  providerId: text("provider_id"),
  providerType: varchar("provider_type", { length: 50 }),
  displayName: varchar("display_name", { length: 255 }),
  mobile: varchar("mobile", { length: 50 }),
  ktpUrl: text("ktp_url"),
  npwpUrl: text("npwp_url"),
  role: varchar("role", { length: 50 }).default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "processing",
  "completed",
  "failed",
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  fileUrl: text("file_url"),
  status: documentStatusEnum("status").default("uploaded"),
  resultJson: jsonb("result_json"),
  createdAt: timestamp("created_at").defaultNow(),
});
