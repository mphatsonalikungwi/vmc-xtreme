(function () {
  const form = document.getElementById("member-register-form");
  if (!form) return;
  const steps = Array.from(form.querySelectorAll(".registration-step"));
  const progress = Array.from(document.querySelectorAll("[data-registration-progress]"));
  let current = 0;

  const basePrices = {
    day: { single: 2000, double: 3000 },
    week: { single: 8000, double: 10000 },
    month: { single: 30000, double: 35000 }
  };

  function updateMembershipPreview() {
    const countInput = form.elements.namedItem("duration_count");
    const unitInput = form.elements.namedItem("duration_unit");
    const unit = unitInput?.value || "";
    const count = Number(countInput?.value || 0);
    const session = form.querySelector('input[name="session_type"]:checked')?.value || "";
    const pricePreview = document.getElementById("price-preview");
    const priceExplanation = document.getElementById("price-explanation");
    const durationSummary = document.getElementById("duration-calculation");
    const durationPeriod = document.getElementById("duration-period");

    if (!pricePreview || !priceExplanation || !durationSummary || !durationPeriod) return;

    const validCount = Number.isInteger(count) && count >= 1 && count <= 3650;
    const price = validCount && basePrices[unit]?.[session]
      ? basePrices[unit][session] * count
      : 0;

    if (price) {
      const unitLabel = unit === "day" ? "day" : unit === "week" ? "week" : "month";
      const sessionLabel = session === "single" ? "Single" : "Double";
      pricePreview.textContent = `K${price.toLocaleString("en-MW")}`;
      priceExplanation.textContent = `${count} ${unitLabel}${count === 1 ? "" : "s"} · ${sessionLabel} sessions`;
    } else {
      pricePreview.textContent = "Choose membership";
      priceExplanation.textContent = "Select duration and session access to calculate your membership price";
    }

    if (!validCount || !unit) {
      durationSummary.textContent = "Choose a duration to calculate your membership period";
      durationPeriod.textContent = "Your membership dates will be confirmed when VMC verifies your payment.";
      return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    if (unit === "day") {
      end.setDate(end.getDate() + count - 1);
    } else if (unit === "week") {
      end.setDate(end.getDate() + count * 7 - 1);
    } else if (unit === "month") {
      const targetMonth = end.getMonth() + count;
      end.setMonth(targetMonth);
      end.setDate(end.getDate() - 1);
    }

    const formatDate = (date) => date.toLocaleDateString("en-MW", {
      day: "numeric", month: "short", year: "numeric"
    });
    const unitLabel = unit === "day" ? "day" : unit === "week" ? "week" : "month";
    durationSummary.textContent = `${count} ${unitLabel}${count === 1 ? "" : "s"}`;
    durationPeriod.textContent = `If approved today: ${formatDate(start)} – ${formatDate(end)}.`;
  }

  function clearFieldErrors(step) {
    step.querySelectorAll(".is-invalid").forEach(field => field.classList.remove("is-invalid"));
    const alert = document.querySelector("[data-form-alert]");
    if (alert) { alert.hidden = true; alert.textContent = ""; }
  }

  function showFieldError(field, message) {
    field.classList.add("is-invalid");
    const alert = document.querySelector("[data-form-alert]");
    if (alert) {
      alert.textContent = message;
      alert.hidden = false;
    }
  }

  function valid(step) {
    clearFieldErrors(step);
    const fields = Array.from(step.querySelectorAll("input,select,textarea")).filter(field => !field.disabled);
    for (const field of fields) {
      if (!field.checkValidity()) {
        const message = field.validity.valueMissing
          ? "Please complete all required fields."
          : field.validationMessage;
        showFieldError(field, message);
        field.focus();
        return false;
      }
    }
    const password = step.querySelector('[name="password"]');
    const confirm = step.querySelector('[name="confirm_password"]');
    if (password && confirm && password.value !== confirm.value) {
      showFieldError(confirm, "Passwords do not match.");
      confirm.focus();
      return false;
    }
    return true;
  }

  function show(index) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, i) => { step.hidden = i !== current; });
    progress.forEach((card, i) => {
      const active = i === current;
      card.classList.toggle("is-active", active);
      if (active) card.setAttribute("aria-current", "step");
      else card.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    updateMembershipPreview();
  }

  form.addEventListener("click", function (event) {
    const next = event.target.closest("[data-next-step]");
    const back = event.target.closest("[data-prev-step]");
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      if (valid(steps[current])) show(current + 1);
    } else if (back) {
      event.preventDefault();
      event.stopPropagation();
      show(current - 1);
    }
  });

  progress.forEach(card => card.addEventListener("click", event => {
    event.preventDefault();
    const target = Number(card.dataset.registrationProgress) - 1;
    if (target <= current) show(target);
  }));

  form.addEventListener("input", updateMembershipPreview);
  form.addEventListener("change", updateMembershipPreview);


  function setupPasswordToggles() {
    form.querySelectorAll("[data-password-toggle]").forEach(button => {
      if (button.dataset.ready === "true") return;
      const input = button.parentElement?.querySelector('input[type="password"]');
      if (!input) return;
      button.dataset.ready = "true";
      button.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "Show" : "Hide";
        button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      });
    });
  }

  function setMessage(text, error = false) {
    const el = form.querySelector("[data-message]");
    if (!el) return;
    el.textContent = text;
    el.dataset.error = error ? "true" : "false";
  }

  function showFailure(error) {
    const message = error?.message || "We could not complete your registration. Please check your details and try again.";
    const shell = document.getElementById("registration-shell");
    const success = document.getElementById("registration-success");
    const alert = document.querySelector("[data-form-alert]");
    if (shell) shell.hidden = false;
    if (success) success.hidden = true;
    show(0);
    const phone = form.elements.namedItem("phone");
    if (/phone number is already registered/i.test(message)) {
      showFieldError(phone, "That phone number is already registered with VMC.");
    } else if (alert) {
      alert.textContent = message;
      alert.hidden = false;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitRegistration() {
    const { VMC_CONFIG } = await import("./config.js");
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");
    if (password !== confirmPassword) throw new Error("Passwords do not match.");

    const response = await fetch(`${VMC_CONFIG.supabaseUrl}/functions/v1/vmc-auth-v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: VMC_CONFIG.supabasePublishableKey
      },
      body: JSON.stringify({
        action: "register",
        full_name: formData.get("full_name"),
        password,
        phone: formData.get("phone"),
        email: formData.get("email"),
        emergency_contact: formData.get("emergency_contact"),
        gender: formData.get("gender"),
        date_of_birth: formData.get("date_of_birth"),
        training_mode: formData.get("training_mode"),
        duration_count: Number(formData.get("duration_count")),
        duration_unit: formData.get("duration_unit"),
        session_type: formData.get("session_type"),
        payment_method: formData.get("payment_method"),
        payment_reference: formData.get("payment_reference"),
        rules_accepted: formData.get("rules_accepted") === "true",
        rules_version: "VMC Rules v1"
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "We could not create your VMC account.");

    const username = String(data.username || "").trim();
    if (!username) throw new Error("VMC created the account without returning a username. Please contact VMC.");

    document.querySelector("[data-credential-username]")?.replaceChildren(document.createTextNode(username));
    document.querySelector("[data-credential-username-login]")?.replaceChildren(document.createTextNode(username));
    document.querySelector("[data-credential-email]")?.replaceChildren(document.createTextNode(formData.get("email") || "No email was provided"));
    document.querySelector("[data-credential-phone]")?.replaceChildren(document.createTextNode(formData.get("phone") || "Your registered phone number"));

    document.getElementById("registration-shell").hidden = true;
    document.getElementById("registration-failure").hidden = true;
    document.getElementById("registration-success").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton?.disabled) return;
    setMessage("Creating your account…");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.textContent;
      submitButton.textContent = "Creating your account…";
    }
    try {
      await submitRegistration();
    } catch (error) {
      console.error("VMC registration failed:", error);
      showFailure(error);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalText || "Create my VMC account";
      }
    }
  });

  setupPasswordToggles();
  show(0);
})();
