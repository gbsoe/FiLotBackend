import { z } from "zod";
import crypto from "crypto";

export const DocumentUploadSchema = z.object({
  type: z.enum(["KTP", "NPWP"], {
    required_error: "Document type is required",
    invalid_type_error: "Document type must be 'KTP' or 'NPWP'",
  }),
});

export const FileTypeSchema = z.enum(
  ["image/jpeg", "image/png", "application/pdf"],
  {
    invalid_type_error:
      "File type must be image/jpeg, image/png, or application/pdf",
  }
);

export const EvaluateDocumentSchema = z.object({
  documentId: z
    .string({
      required_error: "documentId is required",
    })
    .uuid({
      message: "documentId must be a valid UUID",
    }),
});

export const ReviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"], {
    required_error: "Decision is required",
    invalid_type_error: "Decision must be 'approved' or 'rejected'",
  }),
  notes: z
    .string()
    .max(1000, "Notes cannot exceed 1000 characters")
    .optional(),
});

export const InternalReviewPayloadSchema = z.object({
  reviewId: z.string().uuid().optional(),
  documentId: z.string().uuid({
    message: "documentId must be a valid UUID",
  }),
  userId: z.string().uuid({
    message: "userId must be a valid UUID",
  }),
  documentType: z.enum(["KTP", "NPWP"]).optional(),
  parsedData: z.record(z.unknown()).optional(),
  ocrText: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  decision: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
});

export const CallbackPayloadSchema = z.object({
  taskId: z.string().uuid().optional(),
  decision: z.enum(["approved", "rejected"], {
    required_error: "Decision is required",
    invalid_type_error: "Decision must be 'approved' or 'rejected'",
  }),
  notes: z.string().max(1000).optional(),
  documentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

export const VerificationResultSchema = z.object({
  documentId: z.string().uuid({
    message: "documentId must be a valid UUID",
  }),
  userId: z.string().uuid({
    message: "userId must be a valid UUID",
  }),
  verificationResult: z.string(),
  score: z.number().min(0).max(100).optional(),
  decision: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type DocumentUploadInput = z.infer<typeof DocumentUploadSchema>;
export type EvaluateDocumentInput = z.infer<typeof EvaluateDocumentSchema>;
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionSchema>;
export type InternalReviewPayload = z.infer<typeof InternalReviewPayloadSchema>;
export type CallbackPayload = z.infer<typeof CallbackPayloadSchema>;
export type VerificationResultInput = z.infer<typeof VerificationResultSchema>;

export function validateHmacSignature(
  payload: string | object,
  signature: string,
  secret: string
): boolean {
  const payloadString =
    typeof payload === "string" ? payload : JSON.stringify(payload);

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

export function generateHmacSignature(
  payload: string | object,
  secret: string
): string {
  const payloadString =
    typeof payload === "string" ? payload : JSON.stringify(payload);

  return crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
}

export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (
    req: { body: unknown },
    res: { status: (code: number) => { json: (data: unknown) => void } },
    next: () => void
  ) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          message: "Validation failed",
          details: errors,
        },
      });
    }

    req.body = result.data;
    next();
  };
}
