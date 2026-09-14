import { z } from 'zod';

export const appleAuthorizationSchema = z.strictObject({
  protocolVersion: z.literal(1),
  identityToken: z.string().min(1).max(16_384),
  authorizationCode: z.string().min(1).max(4096),
  appleUserId: z.string().min(1).max(256),
});
export type AppleAuthorization = z.infer<typeof appleAuthorizationSchema>;

export const accountDeletionSchema = z.strictObject({
  protocolVersion: z.literal(1),
  deletionId: z.uuid().transform((value) => value.toLowerCase()),
});
export const deletionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const appleRevocationSchema = z.enum([
  'not_required',
  'queued',
  'revoked',
  'manual_required',
]);
export const deletionReceiptRowSchema = z.object({
  deletion_id: z.uuid(),
  status: z.enum(['pending', 'deleted']),
  apple_status: appleRevocationSchema,
});
export type DeletionReceiptRow = z.infer<typeof deletionReceiptRowSchema>;

export function deletionReceipt(row: DeletionReceiptRow) {
  return {
    protocolVersion: 1 as const,
    deletionId: row.deletion_id,
    status: row.status,
    deleted: row.status === 'deleted',
    appleRevocation: row.apple_status,
  };
}
