import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";
import { VMC_CONFIG } from "./config.js";

const supabase = createClient(VMC_CONFIG.supabaseUrl, VMC_CONFIG.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const authUrl = `${VMC_CONFIG.supabaseUrl}/functions/v1/vmc-auth-v2`;

const $ = (selector) => document.querySelector(selector);

function setupPasswordToggles() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest(".password-field")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "password-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "password-toggle";
    toggle.setAttribute("aria-label", "Show password");
    toggle.setAttribute("aria-pressed", "false");
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>';
    wrapper.appendChild(toggle);

    toggle.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      toggle.setAttribute("aria-pressed", String(!showing));
      toggle.innerHTML = showing
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17.7 17.7 0 0 1-3.1 3.8"></path><path d="M6.1 6.1C3.7 7.9 2.5 12 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.6"></path><path d="M9.9 9.9a2.5 2.5 0 0 0 3.5 3.5"></path></svg>';
    });
  });
}
setupPasswordToggles();
const message = (value, error = false) => {
  const el = $("[data-message]");
  if (!el) return;
  el.textContent = value;
  el.dataset.error = error ? "true" : "false";
};

async function authRequest(action, payload) {
  const response = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: VMC_CONFIG.supabasePublishableKey },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function getProfile(userId) {
  const { data, error } = await supabase.from("vmc_profiles")
    .select("id,full_name,username,account_status,must_change_password")
    .eq("id", userId).single();
  if (error || !data || data.account_status !== "active") throw new Error("This VMC account is not active.");
  return data;
}

async function getRoles(userId) {
  const { data, error } = await supabase.from("vmc_user_roles")
    .select("role:vmc_roles(name)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((row) => row.role?.name).filter(Boolean);
}

function go(path) {
  window.location.href = path;
}

async function completeLogin(data, destination, allowedRoles) {
  const { error } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
  });
  if (error) throw error;

  const profile = await getProfile(data.session.user.id);
  if (profile.must_change_password) {
    const next = encodeURIComponent(destination);
    go(`./change-password.html?next=${next}`);
    return;
  }

  const roles = await getRoles(profile.id);
  if (!roles.some((role) => allowedRoles.includes(role))) {
    await supabase.auth.signOut();
    throw new Error("This account does not have access to this portal.");
  }
  go(destination);
}

$("#member-login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  message("Signing in…");
  const form = new FormData(event.currentTarget);
  try {
    const data = await authRequest("login", {
      identifier: form.get("identifier"),
      password: form.get("password")
    });
    await completeLogin(data, "../member/", ["member"]);
  } catch (error) {
    message(error.message, true);
  }
});

$("[data-management-login]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  message("Signing in…");
  const form = new FormData(event.currentTarget);
  try {
    const data = await authRequest("login", {
      identifier: form.get("identifier"),
      password: form.get("password")
    });
    await completeLogin(data, "../management/", ["staff", "manager", "owner"]);
  } catch (error) {
    message(error.message, true);
  }
});

$("[data-password-reset]")?.addEventListener("click", async (event) => {
  event.preventDefault();
  const identifierInput = document.querySelector('[data-management-login] input[name="identifier"]');
  const identifier = String(identifierInput?.value || "").trim();
  if (!identifier) {
    message("Enter your VMC username, email or phone number first.", true);
    identifierInput?.focus();
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  message("Sending password reset instructions…");
  try {
    const data = await authRequest("request_password_reset", { identifier });
    message(data.message || "If the account is eligible, password reset instructions have been sent to its registered email address.");
  } catch (error) {
    message(error?.message || "Password reset could not be requested. Please try again.", true);
  } finally {
    button.disabled = false;
  }
});

function showRegistrationFailure(error) {
  const shell = $("#registration-shell");
  const success = $("#registration-success");
  const failure = $("#registration-failure");
  if (!failure) {
    message(error?.message || "We could not complete your registration.", true);
    return;
  }
  const detail = failure.querySelector("[data-registration-failure-message]");
  if (detail) detail.textContent = error?.message || "We could not complete your registration. Please return to the form and try again.";
  if (shell) shell.hidden = true;
  if (success) success.hidden = true;
  failure.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("[data-registration-retry]")?.addEventListener("click", () => {
  $("#registration-failure").hidden = true;
  $("#registration-success").hidden = true;
  $("#registration-shell").hidden = false;
  message("");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#password-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  const recoveryMode = new URLSearchParams(window.location.search).get("recovery") === "1";
  message(recoveryMode ? "Saving your new password…" : "Saving your new password…");

  try {
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("current_password") || "");
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm_password") || "");

    if (!recoveryMode && !currentPassword) throw new Error("Enter your current password.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (password !== confirm) throw new Error("Passwords do not match.");
    if (!recoveryMode && currentPassword === password) throw new Error("Your new password must be different from your current password.");

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      go("./management-login.html");
      return;
    }

    const updateAttributes = { password };
    if (!recoveryMode) updateAttributes.current_password = currentPassword;

    const { error: updateError } = await supabase.auth.updateUser(updateAttributes);
    if (updateError) throw updateError;

    const { error: rpcError } = await supabase.rpc("vmc_complete_password_change");
    if (rpcError) throw new Error("Password changed, but account setup could not be completed. Please sign in again.");

    const next = new URLSearchParams(window.location.search).get("next");
    go(next === "../management/" || recoveryMode ? "../management/" : "../member/");
  } catch (error) {
    message(error?.message || "Password change could not be completed. Please try again.", true);
    if (submit) submit.disabled = false;
  }
});
