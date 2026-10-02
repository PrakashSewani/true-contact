import { z } from 'zod';

/**
 * TrueContact pairing protocol between the web session and a browser
 * extension. This is a TrueContact mechanism only: no WhatsApp credentials,
 * OTPs, or third-party session secrets are ever involved.
 *
 * Flow:
 * 1. The web app starts a pairing session and displays a short-lived code.
 * 2. The extension exchanges the code for a scoped, short-lived token.
 * 3. The extension uses that token to push import batches.
 */

export const pairingCodeSchema = z.object({
  code: z.string().min(8),
});

export type PairingCode = z.infer<typeof pairingCodeSchema>;

export const pairingExchangeSchema = z.object({
  code: z.string().min(8),
  /** Identifies the extension instance; shown to the user during pairing. */
  extensionId: z.string().min(1),
});

export type PairingExchange = z.infer<typeof pairingExchangeSchema>;

export const pairingSessionSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type PairingSession = z.infer<typeof pairingSessionSchema>;
