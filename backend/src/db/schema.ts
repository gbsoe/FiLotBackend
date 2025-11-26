import { pgTable, text, varchar, timestamp, uuid, pgEnum, jsonb, integer } from "drizzle-orm/pg-core";

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
  verificationStatus: varchar("verification_status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "processing",
  "completed",
  "failed",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "auto_approved",
  "auto_rejected",
  "pending_manual_review",
  "manually_approved",
  "manually_rejected",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  fileUrl: text("file_url"),
  status: documentStatusEnum("status").default("uploaded"),
  verificationStatus: varchar("verification_status", { length: 50 }).default("pending"),
  aiScore: integer("ai_score"),
  aiDecision: varchar("ai_decision", { length: 50 }),
  resultJson: jsonb("result_json"),
  ocrText: text("ocr_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const manualReviews = pgTable("manual_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  decision: varchar("decision", { length: 50 }),
  confidence: integer("confidence"),
  notes: text("notes"),
  buli2TaskId: varchar("buli2_task_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
