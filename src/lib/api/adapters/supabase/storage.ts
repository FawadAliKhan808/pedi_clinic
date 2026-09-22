import type { StorageApi } from "../../storage";
import type { UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";

const BUCKET = "prescriptions";
const DEFAULT_SIGNED_URL_SECONDS = 300;

export class SupabaseStorageApi implements StorageApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  /**
   * Objects live under `<visitId>/...` — the storage policies read that first
   * path segment to decide who may see the file, so the prefix is load-bearing,
   * not cosmetic.
   */
  async uploadPrescriptionImage(
    visitId: UUID,
    file: Blob,
    order: number
  ): Promise<string> {
    const key = `${visitId}/${order}-${crypto.randomUUID()}.jpg`;

    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(key, file, { contentType: file.type || "image/jpeg", upsert: false });

    if (error) throw toApiError(error, "PRESCRIPTION_UPLOAD_FAILED");
    return key;
  }

  async getSignedUrl(
    storageKey: string,
    expiresInSeconds = DEFAULT_SIGNED_URL_SECONDS
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storageKey, expiresInSeconds);

    if (error || !data) throw toApiError(error, "SIGNED_URL_FAILED");
    return data.signedUrl;
  }

  async removePrescriptionImage(storageKey: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).remove([storageKey]);
    if (error) throw toApiError(error, "PRESCRIPTION_DELETE_FAILED");
  }
}
