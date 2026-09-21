import { createClient } from "https://unpkg.com/@supabase/supabase-js@2.116.0/+esm";
import { VMC_CONFIG } from "./config.js";

const supabase = createClient(VMC_CONFIG.supabaseUrl, VMC_CONFIG.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector) => document.querySelector(selector);

const pageType = document.body.classList.contains("management-page") ? "management" : "member";
const allowedRoles = pageType === "management" ? ["staff", "manager", "owner"] : ["member"];

async function loadPortal() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = pageType === "management" ? "../auth/management-login.html" : "../auth/member-login.html";
    return;
  }

  const userId = sessionData.session.user.id;
  const { data: profile, error: profileError } = await supabase.from("vmc_profiles")
    .select("id,full_name,username,must_change_password,account_status")
    .eq("id", userId).single();

  if (profileError || !profile || profile.account_status !== "active") {
    await supabase.auth.signOut();
    window.location.href = pageType === "management" ? "../auth/management-login.html" : "../auth/member-login.html";
    return;
  }

  if (profile.must_change_password) {
    window.location.href = `../auth/change-password.html?next=${encodeURIComponent(pageType === "management" ? "../management/" : "../member/")}`;
    return;
  }

  const { data: roleRows, error: roleError } = await supabase.from("vmc_user_roles")
    .select("role:vmc_roles(name)").eq("user_id", userId);
  if (roleError) throw roleError;

  const roles = (roleRows || []).map((row) => row.role?.name).filter(Boolean);
  const activeRole = roles.find((role) => allowedRoles.includes(role));

  if (!activeRole) {
    await supabase.auth.signOut();
    window.location.href = pageType === "management" ? "../auth/management-login.html" : "../auth/member-login.html";
    return;
  }

  document.querySelectorAll("[data-portal-name]").forEach((el) => { el.textContent = profile.full_name; });
  document.querySelectorAll("[data-portal-username]").forEach((el) => { el.textContent = profile.username || "Not assigned"; });
  document.querySelectorAll("[data-portal-role]").forEach((el) => { el.textContent = activeRole.toUpperCase(); });

  if (pageType === "member") await loadMemberOverview(userId);
  if (pageType === "management") await loadManagementOverview();
}

async function loadMemberOverview(userId) {
  const { data } = await supabase.from("vmc_memberships")
    .select("status,start_date,end_date,plan:vmc_membership_plans(name,duration_unit,duration_count,session_type,price)")
    .eq("member_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const status = $("[data-membership-status]");
  const detail = $("[data-membership-detail]");
  if (!status || !detail) return;
  status.textContent = data?.status ? data.status.replaceAll("_", " ").toUpperCase() : "NOT SET";
  detail.textContent = data?.end_date ? `Valid until ${data.end_date}` : "No active membership recorded";
}

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function loadManagementOverview() {
  const [members, payments, attendance] = await Promise.all([
    countRows("vmc_profiles"),
    countRows("vmc_payments"),
    countRows("vmc_attendance")
  ]);
  $("[data-member-count]")?.replaceChildren(document.createTextNode(String(members)));
  $("[data-payment-count]")?.replaceChildren(document.createTextNode(String(payments)));
  $("[data-attendance-count]")?.replaceChildren(document.createTextNode(String(attendance)));
}

$("[data-sign-out]")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = pageType === "management" ? "../auth/management-login.html" : "../auth/member-login.html";
});

loadPortal().catch(async () => {
  await supabase.auth.signOut();
  window.location.href = pageType === "management" ? "../auth/management-login.html" : "../auth/member-login.html";
});
