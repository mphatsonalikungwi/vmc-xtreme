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

const normalizePhone = (value: string) => value.replace(/[^+\d]/g, "");
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUsername = (value: string) => value.trim().toLowerCase().replace(/^@/, "");

function generateTemporaryPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let value = "";
  for (const byte of bytes) value += alphabet[byte % alphabet.length];
  return value.slice(0, 12) + "!9";
}

function usernameBase(fullName: string) {
  const clean = fullName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28);
  return clean || "member";
}

async function findAvailableUsername(fullName: string) {
  const base = usernameBase(fullName);
  for (let n = 1; n <= 50; n++) {
    const candidate = `@${base}_vmc${n}`;
    const { data, error } = await admin.from("vmc_profiles").select("id").eq("username", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Unable to create a unique VMC username");
}

async function register(body: Record<string, unknown>) {
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" && body.email.trim() ? normalizeEmail(body.email) : null;
  const phone = typeof body.phone === "string" && body.phone.trim() ? normalizePhone(body.phone) : null;

  if (fullName.length < 2 || fullName.length > 100) return json({ error: "Enter a valid full name." }, 400);
  if (!email && !phone) return json({ error: "Provide a phone number or email address." }, 400);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) return json({ error: "Enter a valid phone number." }, 400);

  const username = await findAvailableUsername(fullName);
  const temporaryPassword = generateTemporaryPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email: email ?? undefined,
    phone: phone ?? undefined,
    password: temporaryPassword,
    email_confirm: Boolean(email),
    phone_confirm: Boolean(phone),
    user_metadata: { full_name: fullName, must_change_password: true },
  });

  if (error || !data.user) return json({ error: "We could not create the account. Check the details and try again." }, 400);

  const { error: profileError } = await admin.from("vmc_profiles").update({
    full_name: fullName, username, phone, email, must_change_password: true, account_status: "active"
  }).eq("id", data.user.id);

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return json({ error: "We could not finish creating the account. Please try again." }, 500);
  }

  return json({ ok: true, username, temporary_password: temporaryPassword }, 201);
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
  } catch {
    return json({ error: "Request could not be processed." }, 400);
  }
});
