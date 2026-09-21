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

const normalizePhone = (v: string) => v.replace(/[^+\d]/g, "");
const normalizeEmail = (v: string) => v.trim().toLowerCase();
const normalizeUsername = (v: string) => v.trim().toLowerCase().replace(/^@/, "");

function usernameBase(v: string) {
  const c = v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28);
  return c || "member";
}

async function findAvailableUsername(fullName: string) {
  const base = usernameBase(fullName);
  for (let n = 1; n <= 50; n++) {
    const candidate = `@${base}_vmc${n}`;
    const { data, error } = await admin.from("vmc_profiles")
      .select("id").eq("username", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Unable to create a unique VMC username");
}

function calculateAmount(unit: string, count: number, sessionType: string) {
  const base = BASE_PRICES[unit]?.[sessionType];
  if (!base) throw new Error("Invalid membership selection.");
  return base * count;
}

async function getOrCreatePlan(unit: string, count: number, sessionType: string, amount: number) {
  const name = `${count} ${unit}${count === 1 ? "" : "s"} — ${sessionType === "single" ? "Single" : "Double"}`;
  const { data: existing, error } = await admin.from("vmc_membership_plans")
    .select("id").eq("duration_unit", unit).eq("duration_count", count)
    .eq("session_type", sessionType).eq("price", amount).eq("is_active", true)
    .limit(1);
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
    })
    .select("id").single();
  if (insertError || !data) throw insertError || new Error("Could not create membership plan.");
  return data.id;
}

async function register(body: Record<string, unknown>) {
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const phone = typeof body.phone === "string" && body.phone.trim() ? normalizePhone(body.phone) : null;
  const email = typeof body.email === "string" && body.email.trim() ? normalizeEmail(body.email) : null;
  const emergencyContact = typeof body.emergency_contact === "string" ? body.emergency_contact.trim() : "";
  const gender = typeof body.gender === "string" && body.gender.trim() ? body.gender.trim() : null;
  const dateOfBirth = typeof body.date_of_birth === "string" && body.date_of_birth ? body.date_of_birth : null;
  const trainingMode = typeof body.training_mode === "string" ? body.training_mode : "";
  const durationCount = Number(body.duration_count);
  const durationUnit = typeof body.duration_unit === "string" ? body.duration_unit : "";
  const sessionType = typeof body.session_type === "string" ? body.session_type : "";
  const paymentMethod = typeof body.payment_method === "string" ? body.payment_method : "";
  const paymentReference = typeof body.payment_reference === "string" && body.payment_reference.trim()
    ? body.payment_reference.trim()
    : null;

  if (fullName.length < 2 || fullName.length > 120) return json({ error: "Enter a valid full name." }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "Password must be 8–72 characters." }, 400);
  if (!phone && !email) return json({ error: "Provide a phone number or email address." }, 400);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) return json({ error: "Enter a valid phone number." }, 400);
  if (!emergencyContact || emergencyContact.length > 120) return json({ error: "Enter an emergency contact." }, 400);
  if (!TRAINING_MODES.includes(trainingMode)) return json({ error: "Select a valid training mode." }, 400);
  if (!Number.isInteger(durationCount) || durationCount < 1 || durationCount > 3650) return json({ error: "Enter a valid membership duration." }, 400);
  if (!["day", "week", "month"].includes(durationUnit)) return json({ error: "Select a valid duration unit." }, 400);
  if (!["single", "double"].includes(sessionType)) return json({ error: "Select single or double sessions." }, 400);
  if (!PAYMENT_METHODS.includes(paymentMethod)) return json({ error: "Select a valid payment method." }, 400);
  if (paymentMethod !== "Cash" && !paymentReference) return json({ error: "Enter the payment reference for this payment method." }, 400);

  const amount = calculateAmount(durationUnit, durationCount, sessionType);
  const username = await findAvailableUsername(fullName);
  const planId = await getOrCreatePlan(durationUnit, durationCount, sessionType, amount);

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: email ?? undefined,
    phone: phone ?? undefined,
    password,
    email_confirm: Boolean(email),
    phone_confirm: Boolean(phone),
    user_metadata: {
      full_name: fullName,
      phone,
      must_change_password: true,
    },
  });

  if (authError || !authData.user) return json({ error: "We could not create the account. Check the details and try again." }, 400);

  const userId = authData.user.id;
  let membershipId: string | null = null;
  let paymentId: string | null = null;

  try {
    const { error: profileError } = await admin.from("vmc_profiles").update({
      full_name: fullName,
      username,
      phone,
      email,
      emergency_contact: emergencyContact,
      gender,
      date_of_birth: dateOfBirth,
      must_change_password: true,
      account_status: "active",
    }).eq("id", userId);

    if (profileError) throw profileError;

    const { data: membership, error: membershipError } = await admin.from("vmc_memberships").insert({
      member_id: userId,
      plan_id: planId,
      training_mode: trainingMode,
      status: "pending",
    }).select("id").single();

    if (membershipError || !membership) throw membershipError || new Error("Membership creation failed.");
    membershipId = membership.id;

    const { data: payment, error: paymentError } = await admin.from("vmc_payments").insert({
      member_id: userId,
      membership_id: membership.id,
      amount,
      payment_method: paymentMethod,
      receipt_reference: paymentReference,
      status: "pending",
    }).select("id").single();

    if (paymentError || !payment) throw paymentError || new Error("Payment submission failed.");
    paymentId = payment.id;

    return json({
      ok: true,
      username,
      temporary_password: password,
      membership: {
        duration_count: durationCount,
        duration_unit: durationUnit,
        session_type: sessionType,
        training_mode: trainingMode,
        amount,
      },
      payment: {
        method: paymentMethod,
        reference: paymentReference,
      },
      message: "Registration received. Your membership is under VMC payment review.",
    }, 201);
  } catch (error) {
    if (paymentId) await admin.from("vmc_payments").delete().eq("id", paymentId);
    if (membershipId) await admin.from("vmc_memberships").delete().eq("id", membershipId);
    await admin.auth.admin.deleteUser(userId);
    console.error(error);
    return json({ error: "We could not finish your registration. Please try again." }, 500);
  }
}

async function changeUsername(req: Request, body: Record<string, unknown>) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Authentication required." }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Authentication required." }, 401);

  const requested = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const username = requested.startsWith("@") ? requested : "@" + requested;

  if (!/^@[a-z0-9][a-z0-9_]{2,39}_vmc[0-9]+$/.test(username)) {
    return json({ error: "Enter a valid VMC username." }, 400);
  }

  const { data: existing, error: existingError } = await admin.from("vmc_profiles")
    .select("id").eq("username", username).neq("id", user.id).maybeSingle();
  if (existingError) return json({ error: "Could not check username availability." }, 500);
  if (existing) return json({ error: "That VMC username is already in use." }, 409);

  const { error: updateError } = await admin.from("vmc_profiles")
    .update({ username, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (updateError) return json({ error: "Could not update your VMC username." }, 500);

  return json({ ok: true, username });
}

async function login(body: Record<string, unknown>) {
  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !password || password.length > 200) return json({ error: "Invalid sign-in details." }, 400);

  let email: string | null = null;
  let phone: string | null = null;

  if (identifier.startsWith("@")) {
    const username = `@${normalizeUsername(identifier)}`;
    const { data } = await admin.from("vmc_profiles")
      .select("id,email,phone,account_status").eq("username", username).maybeSingle();
    if (!data || data.account_status !== "active") return json({ error: "Invalid sign-in details." }, 401);
    email = data.email;
    phone = data.phone;
  } else if (identifier.includes("@")) {
    email = normalizeEmail(identifier);
  } else {
    phone = normalizePhone(identifier);
  }

  if (!email && !phone) return json({ error: "Invalid sign-in details." }, 401);
  const credentials = email ? { email, password } : { phone: phone!, password };
  const { data, error } = await admin.auth.signInWithPassword(credentials);
  if (error || !data.session || !data.user) return json({ error: "Invalid sign-in details." }, 401);

  const { data: profile } = await admin.from("vmc_profiles")
    .select("id,full_name,username,email,phone,avatar_url,account_status,must_change_password")
    .eq("id", data.user.id).maybeSingle();

  if (!profile || profile.account_status !== "active") {
    await admin.auth.admin.signOut(data.session.access_token);
    return json({ error: "Invalid sign-in details." }, 401);
  }

  return json({ ok: true, session: data.session, profile });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    if (body?.action === "register") return await register(body);
    if (body?.action === "login") return await login(body);
    if (body?.action === "change_username") return await changeUsername(req, body);
    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Request could not be processed." }, 400);
  }
});
