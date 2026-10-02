import type { NormalizedContact } from '@truecontact/shared';

export interface PairMessage {
  type: 'pair';
  apiBase: string;
  code: string;
}

export interface ScanMessage {
  type: 'scan';
  apiBase: string;
}

export interface StatusMessage {
  type: 'status';
}

export type PopupMessage = PairMessage | ScanMessage | StatusMessage;

export interface PairResult {
  ok: boolean;
  error?: string;
  extensionId?: string;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  pushed?: number;
}

export interface StatusResult {
  paired: boolean;
  extensionId?: string;
  expiresAt?: string;
}

export interface CaptureCommand {
  type: 'capture';
}

export interface CaptureDiagnostics {
  url: string;
  strategy: string | null;
  rowCount: number;
  matchedCount: number;
  firstDataId: string | null;
  firstTitle: string | null;
}

export interface CaptureResult {
  contacts: NormalizedContact[];
  diagnostics?: CaptureDiagnostics;
}
