CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'uploaded'::"public"."document_status";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DATA TYPE "public"."document_status" USING "status"::"public"."document_status";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "result_json" SET DATA TYPE jsonb;