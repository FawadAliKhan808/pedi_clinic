import type { UUID } from "./types";

export interface StorageApi {
  /** Uploads to the private prescription-images bucket; returns an opaque storage key, not a URL. */
  uploadPrescriptionImage(
    visitId: UUID,
    file: Blob,
    order: number
  ): Promise<string>;

  /** Short-lived signed URL for a private storage key. */
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}
