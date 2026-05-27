import { HASH_SEED } from "./build-config";

export type IntegrityCause =
  | "hash-mismatch"
  | "unsupported-version"
  | "missing-field"
  | "legacy-format";

export class IntegrityError extends Error {
  override readonly cause: IntegrityCause;
  readonly version?: string;
  readonly expected?: string;
  readonly actual?: string;

  constructor(
    cause: IntegrityCause,
    opts?: { version?: string; expected?: string; actual?: string },
  ) {
    const messages: Record<IntegrityCause, string> = {
      "hash-mismatch": "Integrity check failed: data has been modified",
      "unsupported-version": `Unsupported schema version: ${opts?.version ?? "unknown"}`,
      "missing-field": "Required metadata field is missing",
      "legacy-format": "Legacy share format is no longer supported",
    };
    super(messages[cause]);
    this.name = "IntegrityError";
    this.cause = cause;
    this.version = opts?.version;
    this.expected = opts?.expected;
    this.actual = opts?.actual;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function computeIntegrityHash(version: string, payload: string): Promise<string> {
  const input = `${HASH_SEED}|${version}|${payload}`;
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToBase64Url(new Uint8Array(hashBuffer));
}

export async function verifyIntegrity(
  version: string,
  payload: string,
  hash: string,
): Promise<boolean> {
  const expected = await computeIntegrityHash(version, payload);
  return expected === hash;
}

interface Verifier {
  compute(payload: string): Promise<string>;
  verify(payload: string, hash: string): Promise<boolean>;
}

function makeVerifier(version: string): Verifier {
  return {
    compute: (payload) => computeIntegrityHash(version, payload),
    verify: (payload, hash) => verifyIntegrity(version, payload, hash),
  };
}

export const INTEGRITY_VERIFIERS: Record<string, Verifier> = {
  "1": makeVerifier("1"),
};
