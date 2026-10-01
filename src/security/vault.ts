import { z } from 'zod/v3';
import { passphraseSchema, tokenSchema } from '../domain';

const ITERATIONS = 600_000;
const bytes = (length: number) => z.array(z.number().int().min(0).max(255)).length(length);
export const vaultSchema = z.object({
  version: z.literal(1),
  iterations: z.literal(ITERATIONS),
  salt: bytes(16),
  iv: bytes(12),
  ciphertext: z.array(z.number().int().min(0).max(255)).min(16).max(8192),
});
export type Vault = z.infer<typeof vaultSchema>;
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
const aad = new TextEncoder().encode('UpDeck:vault:v1');
export async function encryptToken(token: string, passphrase: string): Promise<Vault> {
  tokenSchema.parse(token);
  passphraseSchema.parse(passphrase);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt);
  const plaintext = new TextEncoder().encode(token);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      key,
      plaintext,
    );
    return {
      version: 1,
      iterations: ITERATIONS,
      salt: [...salt],
      iv: [...iv],
      ciphertext: [...new Uint8Array(ciphertext)],
    };
  } finally {
    plaintext.fill(0);
  }
}
export async function decryptToken(input: unknown, passphrase: string) {
  const vault = vaultSchema.parse(input);
  const key = await derive(passphrase, new Uint8Array(vault.salt));
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(vault.iv), additionalData: aad },
      key,
      new Uint8Array(vault.ciphertext),
    ),
  );
  try {
    return tokenSchema.parse(new TextDecoder().decode(plaintext));
  } finally {
    plaintext.fill(0);
  }
}
