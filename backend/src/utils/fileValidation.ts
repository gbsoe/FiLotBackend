import { logger } from "./logger";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MAGIC_NUMBERS: Record<string, { bytes: number[]; offset?: number }[]> = {
  "image/jpeg": [
    { bytes: [0xff, 0xd8, 0xff, 0xe0] }, // JFIF
    { bytes: [0xff, 0xd8, 0xff, 0xe1] }, // EXIF
    { bytes: [0xff, 0xd8, 0xff, 0xe2] }, // ICC Profile
    { bytes: [0xff, 0xd8, 0xff, 0xe8] }, // SPIFF
    { bytes: [0xff, 0xd8, 0xff, 0xdb] }, // Raw JPEG
    { bytes: [0xff, 0xd8, 0xff, 0xee] }, // Adobe JPEG
  ],
  "image/png": [
    { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // PNG signature
  ],
  "application/pdf": [
    { bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  ],
};

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

function checkMagicNumber(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_NUMBERS[mimeType];
  if (!signatures) {
    return false;
  }

  for (const signature of signatures) {
    const offset = signature.offset || 0;
    let match = true;

    for (let i = 0; i < signature.bytes.length; i++) {
      if (buffer[offset + i] !== signature.bytes[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return true;
    }
  }

  return false;
}

function detectMimeFromMagic(buffer: Buffer): string | null {
  for (const [mimeType, signatures] of Object.entries(MAGIC_NUMBERS)) {
    for (const signature of signatures) {
      const offset = signature.offset || 0;
      let match = true;

      for (let i = 0; i < signature.bytes.length; i++) {
        if (buffer[offset + i] !== signature.bytes[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        return mimeType;
      }
    }
  }

  return null;
}

export function validateFile(
  buffer: Buffer,
  declaredMimeType: string,
  originalName?: string
): ValidationResult {
  if (buffer.length > MAX_FILE_SIZE) {
    logger.warn("File validation failed: exceeds size limit", {
      size: buffer.length,
      maxSize: MAX_FILE_SIZE,
    });
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  if (buffer.length === 0) {
    return {
      valid: false,
      error: "File is empty",
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(declaredMimeType)) {
    logger.warn("File validation failed: unsupported MIME type", {
      declaredMimeType,
      allowedTypes: ALLOWED_MIME_TYPES,
    });
    return {
      valid: false,
      error: `Unsupported file type: ${declaredMimeType}. Allowed types: JPEG, PNG, PDF`,
    };
  }

  const detectedMime = detectMimeFromMagic(buffer);

  if (!detectedMime) {
    logger.warn("File validation failed: unable to detect file type from magic number", {
      declaredMimeType,
      originalName,
    });
    return {
      valid: false,
      error: "Unable to verify file type. File may be corrupted or unsupported.",
    };
  }

  const normalizedDeclared = declaredMimeType === "image/jpg" ? "image/jpeg" : declaredMimeType;
  
  if (detectedMime !== normalizedDeclared) {
    logger.warn("File validation failed: MIME type mismatch", {
      declaredMimeType: normalizedDeclared,
      detectedMime,
      originalName,
    });
    return {
      valid: false,
      error: `File content does not match declared type. Declared: ${normalizedDeclared}, Detected: ${detectedMime}`,
    };
  }

  if (!checkMagicNumber(buffer, normalizedDeclared)) {
    logger.warn("File validation failed: magic number verification failed", {
      declaredMimeType: normalizedDeclared,
      originalName,
    });
    return {
      valid: false,
      error: "File signature verification failed. File may be corrupted or tampered.",
    };
  }

  logger.info("File validation passed", {
    declaredMimeType: normalizedDeclared,
    detectedMime,
    size: buffer.length,
    originalName,
  });

  return { valid: true };
}

export function getMaxFileSize(): number {
  return MAX_FILE_SIZE;
}

export function getAllowedMimeTypes(): string[] {
  return [...ALLOWED_MIME_TYPES];
}
