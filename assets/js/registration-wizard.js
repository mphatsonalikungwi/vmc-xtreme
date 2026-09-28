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
    durationSummary.textContent = `${count} ${unitLabel}${count === 1 ? "" : "s"} · calculated automatically`;
    durationPeriod.textContent = `Estimated period if verified today: ${formatDate(start)} – ${formatDate(end)}.`;
  }

  function valid(step) {
    for (const field of step.querySelectorAll("input,select,textarea")) {
      if (!field.disabled && !field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    const password = step.querySelector('[name="password"]');
    const confirm = step.querySelector('[name="confirm_password"]');
    if (password && confirm && password.value !== confirm.value) {
      confirm.setCustomValidity("Passwords do not match.");
      confirm.reportValidity();
      confirm.setCustomValidity("");
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

  show(0);
})();
