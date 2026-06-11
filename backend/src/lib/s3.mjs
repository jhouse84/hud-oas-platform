import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({ region: process.env.REGION || process.env.AWS_REGION });

export const BUCKETS = {
  DOCS:   process.env.BUCKET_DOCS,
  STATIC: process.env.BUCKET_STATIC
};

const DEFAULT_EXPIRES = 300; // 5 minutes

export async function presignDownload({ bucket, key, expires = DEFAULT_EXPIRES, contentDisposition }) {
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(contentDisposition ? { ResponseContentDisposition: contentDisposition } : {})
  });
  return getSignedUrl(s3, cmd, { expiresIn: expires });
}

export async function presignUpload({ bucket, key, contentType = 'application/octet-stream', expires = DEFAULT_EXPIRES, metadata = {} }) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: process.env.KMS_KEY_ID,
    Metadata: metadata
  });
  return getSignedUrl(s3, cmd, {
    expiresIn: expires,
    unhoistableHeaders: new Set(['x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id'])
  });
}

export async function listObjects({ bucket, prefix, maxKeys = 1000 }) {
  const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: maxKeys });
  const res = await s3.send(cmd);
  return res.Contents || [];
}

export async function headObject({ bucket, key }) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export { GetObjectCommand, PutObjectCommand };
