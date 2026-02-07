import { supabase } from "./supabase";

export type AdminRole = "ADMIN_GENERAL" | "ADMIN" | "GM" | "NONE";

export type AdminSession = {
  role: AdminRole;
  isSuper: boolean;
  branchId: number | null;
  mail: string | null;
};

export async function getAdminSession(): Promise<AdminSession> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;

  if (!uid) {
    return { role: "NONE", isSuper: false, branchId: null, mail: null };
  }

  const { data: adminRow, error } = await supabase
    .from("admins")
    .select("mail, branch_id, gm_code, is_super")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) throw error;

  if (!adminRow) {
    return { role: "NONE", isSuper: false, branchId: null, mail: null };
  }

  const role: AdminRole =
    adminRow.is_super ? "ADMIN_GENERAL" : adminRow.gm_code ? "GM" : "ADMIN";

  return {
    role,
    isSuper: !!adminRow.is_super,
    branchId: adminRow.branch_id ?? null,
    mail: adminRow.mail ?? null,
  };
}
