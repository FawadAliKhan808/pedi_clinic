import type { ParentsApi } from "../../parents";
import { ApiError, type Child, type ISODateString, type Parent, type UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";
import { mapChildRow, mapParentRow } from "./mappers";

export class SupabaseParentsApi implements ParentsApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getMyProfile(): Promise<Parent | null> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError || !userData.user) return null;

    const { data, error } = await this.client
      .from("parents")
      .select("*")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) throw new ApiError(error.message, "PARENT_PROFILE_LOOKUP_FAILED", error);
    return data ? mapParentRow(data) : null;
  }

  async ensureProfile(input?: { name?: string }): Promise<Parent> {
    const { data, error } = await this.client.rpc("upsert_parent_profile", {
      p_name: input?.name ?? undefined,
    });
    if (error) throw toApiError(error, "PARENT_PROFILE_SAVE_FAILED");
    return mapParentRow(data);
  }

  async completeProfile({ name }: { name: string }): Promise<Parent> {
    return this.ensureProfile({ name });
  }

  async listMyChildren(): Promise<Child[]> {
    const profile = await this.getMyProfile();
    if (!profile) return [];

    const { data, error } = await this.client
      .from("children")
      .select("*")
      .eq("parent_id", profile.id)
      .order("created_at", { ascending: true });

    if (error) throw new ApiError(error.message, "CHILDREN_LIST_FAILED", error);
    return (data ?? []).map(mapChildRow);
  }

  async addChild({
    name,
    dob,
  }: {
    name: string;
    dob: ISODateString;
  }): Promise<Child> {
    const profile = await this.getMyProfile();
    if (!profile) {
      throw new ApiError(
        "Complete your profile before adding a child",
        "PROFILE_INCOMPLETE"
      );
    }

    const { data, error } = await this.client
      .from("children")
      .insert({ parent_id: profile.id, name, dob })
      .select("*")
      .single();

    if (error) throw toApiError(error, "CHILD_ADD_FAILED");
    return mapChildRow(data);
  }

  async updateChild(
    childId: UUID,
    { name, dob }: { name: string; dob: ISODateString }
  ): Promise<Child> {
    const { data, error } = await this.client.rpc("update_child", {
      p_child_id: childId,
      p_name: name,
      p_dob: dob,
    });
    if (error) throw toApiError(error, "CHILD_UPDATE_FAILED");
    return mapChildRow(data);
  }

  async deleteChild(childId: UUID): Promise<void> {
    const { error } = await this.client.rpc("delete_child", { p_child_id: childId });
    if (error) throw toApiError(error, "CHILD_DELETE_FAILED");
  }
}
