import { createClient } from "https://unpkg.com/@supabase/supabase-js@2.116.0/+esm";
import { VMC_CONFIG } from "./config.js";

document.documentElement.dataset.vmcReady = "true";

const supabase = createClient(VMC_CONFIG.supabaseUrl, VMC_CONFIG.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const authUrl = `${VMC_CONFIG.supabaseUrl}/functions/v1/vmc-auth`;

const $ = (selector) => document.querySelector(selector);
const loginForm = $("#login-form");
const registerForm = $("#register-form");
const passwordForm = $("#password-form");
const credentialsCard = $("#credentials-card");
const passwordChangeCard = $("#password-change-card");
const memberSessionCard = $("#member-session-card");

const showMessage = (selector, message, isError = false) => {
  const el = $(selector);
  if (!el) return;
  el.textContent = message;
  el.dataset.error = isError ? "true" : "false";
};

async function authRequest(action, payload) {
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: VMC_CONFIG.supabasePublishableKey
    },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function showAuthTab(tab) {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tab);
  });
  loginForm.hidden = tab !== "login";
  registerForm.hidden = tab !== "register";
  if (tab === "login") registerForm.reset();
  if (tab === "register") loginForm.reset();
}

async function renderSession(session) {
  if (!session?.user) return;
  const { data: profile, error } = await supabase
    .from("vmc_profiles")
    .select("full_name,username,must_change_password,account_status")
    .eq("id", session.user.id)
    .single();

  if (error || !profile || profile.account_status !== "active") {
    await supabase.auth.signOut();
    return;
  }

  memberSessionCard.hidden = profile.must_change_password;
  passwordChangeCard.hidden = !profile.must_change_password;
  if (!profile.must_change_password) {
    $("[data-member-name]").textContent = profile.full_name;
    $("[data-member-username]").textContent = profile.username || "Not assigned";
  }
}

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => showAuthTab(button.dataset.authTab));
});

registerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("[data-register-message]", "Creating your account…");
  const form = new FormData(registerForm);
  try {
    const data = await authRequest("register", {
      full_name: form.get("full_name"),
      phone: form.get("phone"),
      email: form.get("email")
    });
    $("[data-credential-username]").textContent = data.username;
    $("[data-credential-password]").textContent = data.temporary_password;
    credentialsCard.hidden = false;
    registerForm.hidden = true;
    showMessage("[data-register-message]", "Account created.");
  } catch (error) {
    showMessage("[data-register-message]", error.message, true);
  }
});

$("[data-use-credentials]")?.addEventListener("click", () => {
  credentialsCard.hidden = true;
  showAuthTab("login");
  const username = $("[data-credential-username]").textContent;
  const password = $("[data-credential-password]").textContent;
  loginForm.elements.identifier.value = username;
  loginForm.elements.password.value = password;
  loginForm.elements.password.focus();
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("[data-login-message]", "Signing you in…");
  const form = new FormData(loginForm);
  try {
    const data = await authRequest("login", {
      identifier: form.get("identifier"),
      password: form.get("password")
    });
    const { error } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });
    if (error) throw error;
    loginForm.reset();
    await renderSession(data.session);
    showMessage("[data-login-message]", "Signed in.");
  } catch (error) {
    showMessage("[data-login-message]", error.message, true);
  }
});

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("[data-password-message]", "Updating password…");
  const form = new FormData(passwordForm);
  const password = String(form.get("password") || "");
  const confirm = String(form.get("confirm_password") || "");

  if (password.length < 8) {
    showMessage("[data-password-message]", "Password must be at least 8 characters.", true);
    return;
  }
  if (password !== confirm) {
    showMessage("[data-password-message]", "Passwords do not match.", true);
    return;
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    showMessage("[data-password-message]", updateError.message, true);
    return;
  }

  const { error: rpcError } = await supabase.rpc("vmc_complete_password_change");
  if (rpcError) {
    showMessage("[data-password-message]", "Password changed, but account setup could not be completed. Sign in again.", true);
    return;
  }

  passwordForm.reset();
  showMessage("[data-password-message]", "Password updated. Your account is ready.");
  const { data } = await supabase.auth.getSession();
  await renderSession(data.session);
});

$("[data-sign-out]")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  memberSessionCard.hidden = true;
  passwordChangeCard.hidden = true;
  showAuthTab("login");
  showMessage("[data-login-message]", "You have signed out.");
});

const telLink = document.querySelector('a[href^="tel:"]');
if (telLink) telLink.setAttribute("aria-label", `Call VMC Xtreme Fitness at ${VMC_CONFIG.gym.phone}`);

const { data: initialSession } = await supabase.auth.getSession();
if (initialSession.session) await renderSession(initialSession.session);

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    memberSessionCard.hidden = true;
    passwordChangeCard.hidden = true;
  }
});
