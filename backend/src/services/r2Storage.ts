import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.CF_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.CF_R2_BUCKET_NAME!;
const PUBLIC_BASE_URL = process.env.CF_R2_PUBLIC_BASE_URL || `https://${process.env.CF_R2_BUCKET_NAME}.${process.env.CF_ACCOUNT_ID}.r2.dev`;

export const uploadToR2 = async (key: string, buffer: Buffer, contentType: string) => {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);

  return `${PUBLIC_BASE_URL}/${key}`;
};

export const deleteFromR2 = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await client.send(command);
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
