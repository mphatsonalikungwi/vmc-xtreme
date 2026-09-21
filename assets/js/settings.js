import { createClient } from "https://unpkg.com/@supabase/supabase-js@2.116.0/+esm";
import { VMC_CONFIG } from "./config.js";

const supabase = createClient(VMC_CONFIG.supabaseUrl, VMC_CONFIG.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const authUrl = `${VMC_CONFIG.supabaseUrl}/functions/v1/vmc-auth`;
const form = document.querySelector("#username-form");
const input = document.querySelector("#username-input");
const notice = document.querySelector("[data-username-notice]");

function show(message, error = false) {
  if (!notice) return;
  notice.textContent = message;
  notice.hidden = !message;
  notice.dataset.state = error ? "error" : "success";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const value = String(input?.value || "").trim().toLowerCase();
  if (!/^@?[a-z0-9][a-z0-9_]{2,39}_vmc[0-9]+$/.test(value)) {
    show("Use a username such as @your_name_vmc1.", true);
    return;
  }
  if (button) button.disabled = true;
  show("Saving your username…");
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: VMC_CONFIG.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action: "change_username", username: value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not update your username.");
    document.querySelectorAll("[data-portal-username]").forEach((el) => { el.textContent = data.username; });
    input.value = data.username;
    show("Username updated successfully.");
  } catch (error) {
    show(error.message || "Could not update your username.", true);
  } finally {
    if (button) button.disabled = false;
  }
});

const { data: sessionData } = await supabase.auth.getSession();
if (input && sessionData?.session) {
  const { data } = await supabase.from("vmc_profiles").select("username").eq("id", sessionData.session.user.id).maybeSingle();
  if (data?.username) input.value = data.username;
}
