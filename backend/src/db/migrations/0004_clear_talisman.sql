CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'auto_approved', 'auto_rejected', 'pending_manual_review', 'manually_approved', 'manually_rejected');--> statement-breakpoint
CREATE TABLE "manual_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"decision" varchar(50),
	"confidence" integer,
	"notes" text,
	"buli2_task_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "verification_status" varchar(50) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_decision" varchar(50);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "buli2_ticket_id" varchar(255);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_status" varchar(50) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "manual_reviews" ADD CONSTRAINT "manual_reviews_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_reviews" ADD CONSTRAINT "manual_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;