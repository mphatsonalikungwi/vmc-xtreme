(function () {
  const form = document.getElementById("member-register-form");
  if (!form) return;
  const steps = Array.from(form.querySelectorAll(".registration-step"));
  const progress = Array.from(document.querySelectorAll("[data-registration-progress]"));
  let current = 0;
  function valid(step) {
    for (const field of step.querySelectorAll("input,select,textarea")) {
      if (!field.disabled && !field.checkValidity()) { field.reportValidity(); return false; }
    }
    const password = step.querySelector('[name="password"]');
    const confirm = step.querySelector('[name="confirm_password"]');
    if (password && confirm && password.value !== confirm.value) {
      confirm.setCustomValidity("Passwords do not match."); confirm.reportValidity(); confirm.setCustomValidity(""); return false;
    }
    return true;
  }
  function show(index) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, i) => { step.hidden = i !== current; });
    progress.forEach((card, i) => {
      const active = i === current;
      card.classList.toggle("is-active", active);
      if (active) card.setAttribute("aria-current", "step"); else card.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }
  form.addEventListener("click", function (event) {
    const next = event.target.closest("[data-next-step]");
    const back = event.target.closest("[data-prev-step]");
    if (next) { event.preventDefault(); event.stopPropagation(); if (valid(steps[current])) show(current + 1); }
    else if (back) { event.preventDefault(); event.stopPropagation(); show(current - 1); }
  });
  progress.forEach(card => card.addEventListener("click", event => {
    event.preventDefault();
    const target = Number(card.dataset.registrationProgress) - 1;
    if (target <= current) show(target);
  }));
  show(0);
})();