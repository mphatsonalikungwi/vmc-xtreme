import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const admin = createClient(supabaseUrl, secretKeys["default"], {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const TRAINING_MODES = [
  "Personal Training",
  "Cardio Training",
  "Muscle Building & Toning",
  "Weight Loss",
  "Group Fitness",
  "Beginner Guidance",
];
const PAYMENT_METHODS = ["Airtel Money", "TNM Mpamba", "National Bank", "Cash"];
const BASE_PRICES: Record<string, Record<string, number>> = {
  day: { single: 2000, double: 3000 },
  week: { single: 8000, double: 10000 },
  month: { single: 30000, double: 35000 },
};

function calculateAmount(unit: string, count: number, sessionType: string) {
  const base = BASE_PRICES[unit]?.[sessionType];
  if (!base) throw new Error("Invalid membership selection.");
  return base * count;
}

async function getOrCreatePlan(unit: string, count: number, sessionType: string, amount: number) {
  const name = `${count} ${unit}${count === 1 ? "" : "s"} — ${sessionType === "single" ? "Single" : "Double"}`;
  const { data: existing, error } = await admin.from("vmc_membership_plans")
    .select("id").eq("duration_unit", unit).eq("duration_count", count)
    .eq("session_type", sessionType).eq("price", amount).eq("is_active", true).limit(1);
  if (error) throw error;
  if (existing?.[0]?.id) return existing[0].id;

  const { data, error: insertError } = await admin.from("vmc_membership_plans")
    .insert({
      name,
      duration_unit: unit,
      duration_count: count,
      session_type: sessionType,
      price: amount,
      is_active: true,
    }).select("id").single();
  if (insertError || !data) throw insertError || new Error("Could not create membership plan.");
  return data.id;
}

async function authenticateMember(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: json({ error: "Authentication required." }, 401) };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: "Authentication required." }, 401) };

  const userId = data.user.id;
  const { data: profile, error: profileError } = await admin.from("vmc_profiles")
    .select("id,account_status").eq("id", userId).maybeSingle();
  if (profileError || !profile || profile.account_status !== "active") {
    return { error: json({ error: "This VMC account is not active." }, 403) };
  }

  const { data: roles, error: roleError } = await admin.from("vmc_user_roles")
    .select("role:vmc_roles(name)").eq("user_id", userId);
  if (roleError) return { error: json({ error: "Could not verify account permissions." }, 500) };
  const isMember = (roles || []).some((row: any) => row.role?.name === "member");
  if (!isMember) return { error: json({ error: "This account is not a member account." }, 403) };

  return { userId };
}

async function submitRenewal(req: Request, body: Record<string, unknown>) {
  const auth = await authenticateMember(req);
  if ("error" in auth) return auth.error;
  const userId = auth.userId;

  const durationUnit = typeof body.duration_unit === "string" ? body.duration_unit : "";
  const durationCount = Number(body.duration_count);
  const sessionType = typeof body.session_type === "string" ? body.session_type : "";
  const trainingMode = typeof body.training_mode === "string" ? body.training_mode : "";
  const paymentMethod = typeof body.payment_method === "string" ? body.payment_method : "";
  const paymentReference = typeof body.payment_reference === "string" && body.payment_reference.trim()
    ? body.payment_reference.trim()
    : null;

  if (!["day", "week", "month"].includes(durationUnit)) return json({ error: "Select a valid duration unit." }, 400);
  if (!Number.isInteger(durationCount) || durationCount < 1 || durationCount > 3650) return json({ error: "Enter a valid membership duration." }, 400);
  if (!["single", "double"].includes(sessionType)) return json({ error: "Select single or double sessions." }, 400);
  if (!TRAINING_MODES.includes(trainingMode)) return json({ error: "Select a valid training mode." }, 400);
  if (!PAYMENT_METHODS.includes(paymentMethod)) return json({ error: "Select a valid payment method." }, 400);
  if (paymentMethod !== "Cash" && !paymentReference) return json({ error: "Enter the payment reference for this payment method." }, 400);
  if (paymentReference && paymentReference.length > 120) return json({ error: "Payment reference is too long." }, 400);

  const { data: existingPending, error: pendingError } = await admin.from("vmc_memberships")
    .select("id").eq("member_id", userId).eq("status", "pending").limit(1);
  if (pendingError) return json({ error: "Could not check your existing membership requests." }, 500);
  if (existingPending?.length) return json({ error: "You already have a membership payment waiting for VMC verification." }, 409);

  const { data: memberships, error: membershipReadError } = await admin.from("vmc_memberships")
    .select("id,status,start_date,end_date,created_at").eq("member_id", userId)
    .order("created_at", { ascending: false }).limit(1);
  if (membershipReadError) return json({ error: "Could not verify your membership history." }, 500);
  if (!memberships?.length) return json({ error: "No existing VMC membership was found for this account." }, 404);

  const amount = calculateAmount(durationUnit, durationCount, sessionType);
  const planId = await getOrCreatePlan(durationUnit, durationCount, sessionType, amount);

  let membershipId: string | null = null;
  let paymentId: string | null = null;
  try {
    const { data: membership, error: membershipError } = await admin.from("vmc_memberships").insert({
      member_id: userId,
      plan_id: planId,
      training_mode: trainingMode,
      status: "pending",
    }).select("id").single();
    if (membershipError || !membership) throw membershipError || new Error("Renewal membership creation failed.");
    membershipId = membership.id;

    const { data: payment, error: paymentError } = await admin.from("vmc_payments").insert({
      member_id: userId,
      membership_id: membership.id,
      amount,
      payment_method: paymentMethod,
      receipt_reference: paymentReference,
      status: "pending",
    }).select("id").single();
    if (paymentError || !payment) throw paymentError || new Error("Renewal payment submission failed.");
    paymentId = payment.id;

    return json({
      ok: true,
      membership_id: membershipId,
      payment_id: paymentId,
      amount,
      message: "Renewal submitted. Your payment is waiting for VMC verification.",
    }, 201);
  } catch (error) {
    if (paymentId) await admin.from("vmc_payments").delete().eq("id", paymentId);
    if (membershipId) await admin.from("vmc_memberships").delete().eq("id", membershipId);
    console.error(error);
    return json({ error: "We could not finish your renewal submission. Please try again." }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    if (body?.action === "submit_renewal") return await submitRenewal(req, body);
    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Request could not be processed." }, 400);
  }
});
