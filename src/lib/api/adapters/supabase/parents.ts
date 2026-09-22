import type { ParentsApi } from "../../parents";
import { ApiError, type Child, type ISODateString, type Parent } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
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

  async completeProfile({ name }: { name: string }): Promise<Parent> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    const user = userData?.user;
    if (userError || !user) {
      throw new ApiError("Not authenticated", "NOT_AUTHENTICATED", userError);
    }
    if (!user.phone) {
      throw new ApiError("No verified phone on this account", "MISSING_PHONE");
    }

    const { data, error } = await this.client
      .from("parents")
      .upsert({ user_id: user.id, phone: user.phone, name }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) throw new ApiError(error.message, "PARENT_PROFILE_SAVE_FAILED", error);
    return mapParentRow(data);
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

    if (error) throw new ApiError(error.message, "CHILD_ADD_FAILED", error);
    return mapChildRow(data);
  }
}
