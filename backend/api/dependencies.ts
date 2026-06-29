// backend/api/dependencies.ts
import { supabase } from "./supabaseClient.ts";
import type { Database } from "./database.types.ts";

export interface User {
  id: string;
  email: string;
}

export const getCurrentUser = async (ctx: any): Promise<User | null> => {
  const authHeader = ctx.request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
};
