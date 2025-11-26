import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "../utils/logger";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.CF_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.CF_R2_BUCKET_NAME!;

export const uploadToR2 = async (key: string, buffer: Buffer, contentType: string): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);

  logger.info("File uploaded to R2", { key, contentType, size: buffer.length });

  return key;
};

export const deleteFromR2 = async (key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await client.send(command);
  
  logger.info("File deleted from R2", { key });
};

export const downloadFromR2 = async (key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const response = await client.send(command);
  
  if (!response.Body) {
    throw new Error("No data received from R2");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

export const generatePresignedUrl = async (
  key: string,
  expiresInSeconds: number = 300
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const signedUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  logger.info("Presigned URL generated", { key, expiresInSeconds });

  return signedUrl;
};

export const extractKeyFromUrl = (fileUrl: string): string => {
  if (!fileUrl) {
    throw new Error("File URL is empty or undefined");
  }

  if (fileUrl.startsWith("http")) {
    try {
      const url = new URL(fileUrl);
      const pathname = url.pathname;
      const key = pathname.startsWith("/") ? pathname.slice(1) : pathname;
      return key;
    } catch (error) {
      const urlParts = fileUrl.split("/");
      const bucketIndex = urlParts.findIndex(part => 
        part.includes(".r2.") || part.includes("r2.dev")
      );
      if (bucketIndex >= 0 && bucketIndex + 1 < urlParts.length) {
        return urlParts.slice(bucketIndex + 1).join("/");
      }
      return urlParts.slice(-2).join("/");
    }
  }
  
  return fileUrl;
};
