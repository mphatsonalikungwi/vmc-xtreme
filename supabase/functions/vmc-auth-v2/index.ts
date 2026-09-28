import { createClient } from "npm:@supabase/supabase-js@2.116.0";

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

const normalizePhone = (value: string) => value.replace(/[^+\d]/g, "");
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUsername = (value: string) => value.trim().toLowerCase().replace(/^@/, "");

const TRAINING_MODES = [
  "Personal Training",
  "Cardio Training",
  "Muscle Building & Toning",
  "Weight Loss",
  "Group Fitness",
  "Beginner Guidance",
] as const;

const PAYMENT_METHODS = ["Airtel Money", "TNM Mpamba", "National Bank", "Cash"] as const;
const DURATION_UNITS = ["day", "week", "month"] as const;
const SESSION_TYPES = ["single", "double"] as const;

function generateTemporaryPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let value = "";
  for (const byte of bytes) value += alphabet[byte % alphabet.length];
  return value.slice(0, 12) + "!9";
}

function usernameBase(fullName: string) {
  const parts = fullName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const surname = (parts[parts.length - 1] ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const base = first && surname ? `${first.slice(0, 1)}${surname}` : "";
  return base.slice(0, 31) || "vmcmember";
}

async function findAvailableUsername(fullName: string) {
  const base = usernameBase(fullName);
  for (let n = 0; n <= 50; n++) {
    const candidate = n === 0 ? `@${base}` : `@${base}${n + 1}`;
    const { data, error } = await admin.from("vmc_profiles").select("id").eq("username", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Unable to create a unique VMC username");
}

async function getOrCreatePlan(unit: string, count: number, sessionType: string, amount: number) {
  const name = `${count} ${unit}${count === 1 ? "" : "s"} — ${sessionType === "single" ? "Single" : "Double"}`;
  const { data: existing, error } = await admin.from("vmc_membership_plans")
    .select("id,name,duration_unit,duration_count,session_type,price")
    .eq("duration_unit", unit).eq("duration_count", count)
    .eq("session_type", sessionType).eq("price", amount).eq("is_active", true).limit(1);
  if (error) throw error;
  if (existing?.[0]) return existing[0];
  const { data, error: insertError } = await admin.from("vmc_membership_plans")
    .insert({ name, duration_unit: unit, duration_count: count, session_type: sessionType, price: amount, is_active: true })
    .select("id,name,duration_unit,duration_count,session_type,price").single();
  if (insertError || !data) throw insertError ?? new Error("Could not create membership plan.");
  return data;
}

async function register(body: Record<string, unknown>) {
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" && body.email.trim() ? normalizeEmail(body.email) : null;
  const phone = typeof body.phone === "string" && body.phone.trim() ? normalizePhone(body.phone) : null;
  const password = typeof body.password === "string" ? body.password : "";
  const emergencyContact = typeof body.emergency_contact === "string" ? body.emergency_contact.trim() : null;
  const gender = typeof body.gender === "string" && body.gender.trim() ? body.gender.trim() : null;
  const dateOfBirth = typeof body.date_of_birth === "string" && body.date_of_birth.trim() ? body.date_of_birth.trim() : null;
  const trainingMode = typeof body.training_mode === "string" ? body.training_mode.trim() : "";
  const durationCount = Math.floor(Number(body.duration_count ?? 0));
  const durationUnit = typeof body.duration_unit === "string" ? body.duration_unit.trim() : "";
  const sessionType = typeof body.session_type === "string" ? body.session_type.trim() : "";
  const paymentMethod = typeof body.payment_method === "string" ? body.payment_method.trim() : "";
  const paymentReference = typeof body.payment_reference === "string" ? body.payment_reference.trim() : "";
  const rulesAccepted = body.rules_accepted === true;
  const rulesVersion = typeof body.rules_version === "string" ? body.rules_version.trim() : "";

  if (fullName.length < 2 || fullName.length > 120) return json({ error: "Enter a valid full name." }, 400);
  if (!email && !phone) return json({ error: "Provide a phone number or email address." }, 400);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) return json({ error: "Enter a valid phone number." }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "Password must be between 8 and 72 characters." }, 400);
  if (!TRAINING_MODES.includes(trainingMode as typeof TRAINING_MODES[number])) return json({ error: "Choose a valid VMC training mode." }, 400);
  if (!DURATION_UNITS.includes(durationUnit as typeof DURATION_UNITS[number]) || durationCount < 1 || durationCount > 3650) return json({ error: "Choose a valid membership duration." }, 400);
  if (!SESSION_TYPES.includes(sessionType as typeof SESSION_TYPES[number])) return json({ error: "Choose a valid session type." }, 400);
  if (!PAYMENT_METHODS.includes(paymentMethod as typeof PAYMENT_METHODS[number])) return json({ error: "Choose a valid payment method." }, 400);
  if (paymentMethod !== "Cash" && !paymentReference) return json({ error: "Enter the payment reference for this payment method." }, 400);
  if (!rulesAccepted || rulesVersion !== "VMC Rules v1") return json({ error: "Please accept the current VMC Xtreme rules before creating your account." }, 400);

  const { data: basePlan, error: planError } = await admin
    .from("vmc_membership_plans")
    .select("price")
    .eq("duration_unit", durationUnit)
    .eq("duration_count", 1)
    .eq("session_type", sessionType)
    .eq("is_active", true)
    .maybeSingle();

  if (planError) return json({ error: "Membership pricing could not be loaded. Please try again." }, 500);
  if (!basePlan) return json({ error: "That membership option is currently unavailable." }, 400);

  const amount = Number(basePlan.price) * durationCount;
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: "The selected membership price is invalid." }, 400);

  let plan;
  try {
    plan = await getOrCreatePlan(durationUnit, durationCount, sessionType, amount);
  } catch (error) {
    console.error("VMC membership plan creation failed:", error);
    return json({ error: "That membership option could not be prepared. Please try again." }, 500);
  }

  if (email) {
    const { data: existingProfile } = await admin.from("vmc_profiles").select("id").eq("email", email).maybeSingle();
    if (existingProfile) return json({ error: "That email address is already registered with VMC." }, 409);
  }
  if (phone) {
    const { data: existingProfile } = await admin.from("vmc_profiles").select("id").eq("phone", phone).maybeSingle();
    if (existingProfile) return json({ error: "That phone number is already registered with VMC." }, 409);
  }

  const username = await findAvailableUsername(fullName);
  const { data, error } = await admin.auth.admin.createUser({
    email: email ?? undefined,
    phone: phone ?? undefined,
    password,
    email_confirm: Boolean(email),
    phone_confirm: Boolean(phone),
    user_metadata: { full_name: fullName, username, must_change_password: true },
  });

  if (error || !data.user) return json({ error: "We could not create the account. Check the details and try again." }, 400);

  const userId = data.user.id;

  try {
    const { error: profileError } = await admin.from("vmc_profiles").update({
      full_name: fullName,
      phone,
      email,
      emergency_contact: emergencyContact,
      gender,
      date_of_birth: dateOfBirth,
      must_change_password: true,
      account_status: "active",
    });
    if (profileError) throw profileError;
    const { data: createdProfile, error: profileReadError } = await admin.from("vmc_profiles").select("username").eq("id", userId).single();
    if (profileReadError || !createdProfile?.username) throw profileReadError ?? new Error("VMC username could not be assigned.");
    const assignedUsername = createdProfile.username;

    const { data: role, error: roleError } = await admin.from("vmc_roles").select("id").eq("name", "member").single();
    if (roleError || !role) throw roleError ?? new Error("Member role is not configured.");
    const { error: roleWriteError } = await admin.from("vmc_user_roles").upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id" });
    if (roleWriteError) throw roleWriteError;

    const { data: membership, error: membershipError } = await admin
      .from("vmc_memberships")
      .insert({
        member_id: userId,
        plan_id: plan.id,
        training_mode: trainingMode,
        status: "pending",
      })
      .select("id,plan_id,status,training_mode")
      .single();
    if (membershipError || !membership) throw membershipError ?? new Error("Membership record could not be created.");

    const { error: paymentError } = await admin
      .from("vmc_payments")
      .insert({
        member_id: userId,
        membership_id: membership.id,
        amount,
        payment_method: paymentMethod,
        receipt_reference: paymentReference || null,
        status: "pending",
      });
    if (paymentError) throw paymentError;

    return json({
      ok: true,
      username: assignedUsername,
      membership: {
        id: membership.id,
        plan: plan.name,
        duration_count: durationCount,
        duration_unit: durationUnit,
        session_type: sessionType,
        training_mode: trainingMode,
        amount,
        status: "pending",
      },
    }, 201);
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    console.error("VMC registration transaction failed:", error);
    return json({ error: "We could not finish creating the VMC membership. No account was left active. Please try again." }, 500);
  }
}

async function changeUsername(req: Request, body: Record<string, unknown>) {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication is required." }, 401);
  const publicKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!);
  const userClient = createClient(supabaseUrl, publicKeys["default"], {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Your session is invalid or expired." }, 401);
  const raw = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const username = raw.startsWith("@") ? raw : `@${raw}`;
  if (!/^@[a-z0-9][a-z0-9_-]{2,39}$/.test(username)) return json({ error: "Use a valid VMC username." }, 400);
  const { data: existing } = await admin.from("vmc_profiles").select("id").ilike("username", username).neq("id", authData.user.id).maybeSingle();
  if (existing) return json({ error: "That VMC username is already in use." }, 409);
  const { error } = await admin.from("vmc_profiles").update({ username, updated_at: new Date().toISOString() }).eq("id", authData.user.id);
  if (error) return json({ error: "Could not update your VMC username." }, 500);
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
    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("VMC auth request failed:", error);
    return json({ error: "Request could not be processed." }, 400);
  }
});
