import { createClient } from "https://unpkg.com/@supabase/supabase-js@2.116.0/+esm";
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

$("#member-register-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('[type="submit"]');
  message("Creating your account and submitting your membership…");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = "Creating your account…";
  }
  const form = new FormData(formElement);
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirm_password") || "");
  if (password !== confirmPassword) {
    message("Passwords do not match.", true);
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText || "Create my VMC account";
    }
    return;
  }
  try {
    const data = await authRequest("register", {
      full_name: form.get("full_name"), password,
      phone: form.get("phone"), email: form.get("email"),
      emergency_contact: form.get("emergency_contact"), gender: form.get("gender"),
      date_of_birth: form.get("date_of_birth"), training_mode: form.get("training_mode"),
      duration_count: Number(form.get("duration_count")), duration_unit: form.get("duration_unit"),
      session_type: form.get("session_type"), payment_method: form.get("payment_method"),
      payment_reference: form.get("payment_reference"),
      rules_accepted: form.get("rules_accepted") === "true",
      rules_version: "VMC Rules v1"
    });
    const username = String(data.username || "").trim();
    if (!username) throw new Error("VMC created the account response without a username. Please contact VMC before trying again.");
    $("[data-credential-username]")?.replaceChildren(document.createTextNode(username));
    $("[data-credential-username-login]")?.replaceChildren(document.createTextNode(username));
    $("[data-credential-email]")?.replaceChildren(document.createTextNode(form.get("email") ? form.get("email") : "No email was provided"));
    $("[data-credential-phone]")?.replaceChildren(document.createTextNode(form.get("phone") || "Your registered phone number"));
    $("#registration-shell").hidden = true;
    $("#registration-failure").hidden = true;
    $("#registration-success").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("VMC registration failed:", error);
    showRegistrationFailure(error);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText || "Create my VMC account";
    }
  }
});

$("[data-registration-retry]")?.addEventListener("click", () => {
  $("#registration-failure").hidden = true;
  $("#registration-success").hidden = true;
  $("#registration-shell").hidden = false;
  message("");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#password-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  message("Saving your new password…");
  const form = new FormData(event.currentTarget);
  const currentPassword = String(form.get("current_password") || "");
  const password = String(form.get("password") || "");
  const confirm = String(form.get("confirm_password") || "");
  if (!currentPassword) return message("Enter your current password.", true);
  if (password.length < 8) return message("Password must be at least 8 characters.", true);
  if (password !== confirm) return message("Passwords do not match.", true);
  if (currentPassword === password) return message("Your new password must be different from your current password.", true);

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return go("./member-login.html");

  const { data: profile, error: profileError } = await supabase.from("vmc_profiles")
    .select("email,phone").eq("id", sessionData.session.user.id).single();
  if (profileError || !profile) return message("We could not verify your account identity. Please sign in again.", true);

  const identity = profile.email || profile.phone;
  if (!identity) return message("No sign-in identity is available for this account. Please contact VMC.", true);

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    [profile.email ? "email" : "phone"]: identity,
    password: currentPassword
  });
  if (verifyError) return message("The current password is incorrect.", true);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return message(error.message, true);

  const { error: rpcError } = await supabase.rpc("vmc_complete_password_change");
  if (rpcError) return message("Password changed, but account setup could not be completed. Please sign in again.", true);

  const next = new URLSearchParams(window.location.search).get("next");
  const destination = next === "../management/" ? "../management/" : "../member/";
  go(destination);
});

const registrationForm = $("#member-register-form");
const pricePreview = $("#price-preview");
const priceExplanation = $("#price-explanation");
const referenceInput = registrationForm?.querySelector('[name="payment_reference"]');
const paymentMethodInput = registrationForm?.querySelector('[name="payment_method"]');
const basePrices = { day: { single: 2000, double: 3000 }, week: { single: 8000, double: 10000 }, month: { single: 30000, double: 35000 } };

const registrationSteps = [...document.querySelectorAll("#member-register-form .registration-step")];
let currentRegistrationStep = 0;

function validateRegistrationStep(step) {
  if (!step) return false;
  const fields = [...step.querySelectorAll("input, select, textarea")].filter((field) => !field.disabled);
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  const password = step.querySelector('[name="password"]');
  const confirmPassword = step.querySelector('[name="confirm_password"]');
  if (password && confirmPassword && password.value !== confirmPassword.value) {
    confirmPassword.setCustomValidity("Passwords do not match.");
    confirmPassword.reportValidity();
    confirmPassword.setCustomValidity("");
    return false;
  }
  return true;
}

function showRegistrationStep(index) {
  if (!registrationSteps.length) return;
  currentRegistrationStep = Math.max(0, Math.min(index, registrationSteps.length - 1));
  registrationSteps.forEach((step, i) => {
    step.hidden = i !== currentRegistrationStep;
  });

  document.querySelectorAll("[data-registration-progress]").forEach((card, i) => {
    const active = i === currentRegistrationStep;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-current", active ? "step" : "false");
  });

  if (currentRegistrationStep === 2) {
    updateRegistrationPrice();
    updateDurationCalculation();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("#member-register-form [data-next-step]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    const step = registrationSteps[currentRegistrationStep];
    if (validateRegistrationStep(step)) showRegistrationStep(currentRegistrationStep + 1);
  });
});

document.querySelectorAll("#member-register-form [data-prev-step]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    showRegistrationStep(currentRegistrationStep - 1);
  });
});

document.querySelectorAll("[data-registration-progress]").forEach((card) => {
  card.addEventListener("click", (event) => {
    event.preventDefault();
    const target = Number(card.dataset.registrationProgress) - 1;
    if (target <= currentRegistrationStep) showRegistrationStep(target);
  });
});

registrationForm?.addEventListener("input", updateRegistrationPrice);
registrationForm?.addEventListener("change", updateRegistrationPrice);
paymentMethodInput?.addEventListener("change", () => {
  referenceInput.required = false;
  referenceInput.placeholder = paymentMethodInput.value === "Cash"
    ? "Optional cash receipt / note"
    : "Optional transaction / receipt reference";
});


supabase.auth.getSession().then(({ data: initialSession }) => {
  if ($("#password-form") && !initialSession.session) go("./member-login.html");
});

function calculateMembershipPeriod(count, unit) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (unit === "day") end.setDate(end.getDate() + count - 1);
  else if (unit === "week") end.setDate(end.getDate() + count * 7 - 1);
  else if (unit === "month") {
    const originalDay = end.getDate();
    end.setMonth(end.getMonth() + count);
    end.setDate(Math.min(originalDay, new Date(end.getFullYear(), end.getMonth(), 0).getDate()) - 1);
  }
  return { start, end };
}

function formatMembershipDate(date) {
  return date.toLocaleDateString("en-MW", { day: "numeric", month: "short", year: "numeric" });
}
function updateRegistrationPrice() {
  if (!registrationForm || !pricePreview) return;
  const countInput = registrationForm.elements.namedItem("duration_count");
  const unitInput = registrationForm.elements.namedItem("duration_unit");
  const count = Math.max(1, Math.floor(Number(countInput?.value || 1)));
  const unit = unitInput?.value || "month";
  const session = registrationForm.querySelector('input[name="session_type"]:checked')?.value || "single";
  const basePrice = basePrices[unit]?.[session] || 0;
  const amount = basePrice * count;
  pricePreview.textContent = basePrice ? `K${amount.toLocaleString("en-MW")}` : "K0";
  priceExplanation.textContent = basePrice
    ? `${count} ${unit}${count === 1 ? "" : "s"} · ${session === "single" ? "Single" : "Double"} sessions · K${basePrice.toLocaleString("en-MW")} per ${unit}`
    : "Choose a valid duration and session access";
}
registrationForm?.addEventListener("input", updateRegistrationPrice);
registrationForm?.addEventListener("change", updateRegistrationPrice);
paymentMethodInput?.addEventListener("change", () => {
  referenceInput.required = false;
  referenceInput.placeholder = paymentMethodInput.value === "Cash"
    ? "Optional cash receipt / note"
    : "Optional transaction / receipt reference";
});

function updateDurationCalculation() {
  if (!registrationForm) return;
  const count = Math.max(1, Math.floor(Number(registrationForm.elements.namedItem("duration_count")?.value || 1)));
  const unit = registrationForm.elements.namedItem("duration_unit")?.value || "month";
  const label = `${count} ${unit}${count === 1 ? "" : "s"}`;
  const period = calculateMembershipPeriod(count, unit);
  const summary = $("#duration-calculation");
  const periodText = $("#duration-period");
  if (summary) summary.textContent = `${label} · calculated automatically`;
  if (periodText) periodText.textContent = `Estimated period if verified today: ${formatMembershipDate(period.start)} – ${formatMembershipDate(period.end)}.`;
}

registrationForm?.addEventListener("input", updateDurationCalculation);
registrationForm?.addEventListener("change", updateDurationCalculation);
updateRegistrationPrice();
updateDurationCalculation();
showRegistrationStep(0);