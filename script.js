const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const menu = document.querySelector("[data-menu]");
const menuLinks = menu?.querySelectorAll("a") ?? [];

const setMenuState = (open) => {
  if (!menuButton || !menu) return;
  menuButton.setAttribute("aria-expanded", String(open));
  menu.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
};

menuButton?.addEventListener("click", () => {
  setMenuState(menuButton.getAttribute("aria-expanded") !== "true");
});

menuLinks.forEach((link) => link.addEventListener("click", () => setMenuState(false)));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuState(false);
});

const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 20);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -5%" },
  );
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

document.querySelectorAll("[data-project-card]").forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    card.style.transform = `perspective(1200px) rotateX(${y * -1.2}deg) rotateY(${x * 1.2}deg)`;
  });
  card.addEventListener("pointerleave", () => {
    card.style.transform = "";
  });
});

const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();

const requestForm = document.querySelector("[data-request-form]");

if (requestForm) {
  const panels = [...requestForm.querySelectorAll("[data-form-step]")];
  const reviewPanel = requestForm.querySelector("[data-form-review]");
  const nextButton = requestForm.querySelector("[data-form-next]");
  const backButton = requestForm.querySelector("[data-form-back]");
  const editButton = requestForm.querySelector("[data-edit-request]");
  const emailLink = requestForm.querySelector("[data-email-request]");
  const submitButton = requestForm.querySelector("[data-submit-request]");
  const submitStatus = requestForm.querySelector("[data-submit-status]");
  const actions = requestForm.querySelector("[data-form-actions]");
  const errorMessage = requestForm.querySelector("[data-form-error]");
  const progressBar = document.querySelector("[data-progress-bar]");
  const stepLabel = document.querySelector("[data-step-label]");
  const stepName = document.querySelector("[data-step-name]");
  const reviewOutput = requestForm.querySelector("[data-review-output]");
  const draftStatus = document.querySelector("[data-draft-status]");
  const stepNames = ["Service", "Project context", "Constraints", "Contact"];
  let activeStep = 1;

  const getData = () => {
    const data = new FormData(requestForm);
    return {
      service: data.get("service") || "",
      projectStage: data.get("projectStage") || "",
      projectName: data.get("projectName") || "",
      problem: data.get("problem") || "",
      budget: data.get("budget") || "",
      timeline: data.get("timeline") || "",
      needs: data.getAll("needs"),
      name: data.get("name") || "",
      email: data.get("email") || "",
      company: data.get("company") || "",
      link: data.get("link") || "",
      website: data.get("website") || "",
    };
  };

  const updateSummary = () => {
    const data = getData();
    const values = {
      service: data.service || "Not selected",
      stage: data.projectStage || "Not selected",
      budget: data.budget || "Not selected",
      timeline: data.timeline || "Not selected",
    };
    Object.entries(values).forEach(([key, value]) => {
      const element = document.querySelector(`[data-summary-${key}]`);
      if (element) element.textContent = value;
    });
  };

  const saveSessionDraft = () => {
    const data = getData();
    try {
      sessionStorage.setItem("kaushik-ai-request", JSON.stringify(data));
      if (draftStatus) draftStatus.textContent = "Draft saved for this browser tab only.";
    } catch {
      if (draftStatus) draftStatus.textContent = "Draft is active for this page only.";
    }
  };

  const restoreSessionDraft = () => {
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem("kaushik-ai-request") || "null");
    } catch {
      saved = null;
    }
    if (!saved) return;

    Object.entries(saved).forEach(([name, value]) => {
      if (name === "needs" && Array.isArray(value)) {
        value.forEach((item) => {
          const input = [...requestForm.querySelectorAll('input[name="needs"]')].find((candidate) => candidate.value === item);
          if (input) input.checked = true;
        });
        return;
      }

      const inputs = [...requestForm.querySelectorAll(`[name="${name}"]`)];
      if (!inputs.length || value === "") return;
      if (inputs[0].type === "radio") {
        const matchingInput = inputs.find((input) => input.value === value);
        if (matchingInput) matchingInput.checked = true;
      } else if (inputs[0].type !== "checkbox") {
        inputs[0].value = value;
      }
    });
  };

  const showStep = (step) => {
    activeStep = Math.max(1, Math.min(4, step));
    panels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.formStep) !== activeStep;
    });
    reviewPanel.hidden = true;
    actions.hidden = false;
    errorMessage.textContent = "";
    backButton.disabled = activeStep === 1;
    nextButton.textContent = activeStep === 4 ? "Review request" : "Continue";
    progressBar.style.width = `${activeStep * 25}%`;
    stepLabel.textContent = `Step ${activeStep} of 4`;
    stepName.textContent = stepNames[activeStep - 1];
  };

  const validateStep = () => {
    const panel = panels[activeStep - 1];
    const invalidInput = panel.querySelector("input:invalid, textarea:invalid, select:invalid");
    panel.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
    if (!invalidInput) return true;

    invalidInput.setAttribute("aria-invalid", "true");
    errorMessage.textContent = invalidInput.validity.valueMissing
      ? "Complete the required field before continuing."
      : "Check the highlighted field and enter a valid value.";
    invalidInput.focus();
    return false;
  };

  const addReviewRow = (list, label, value) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value || "—";
    row.append(term, description);
    list.append(row);
  };

  const showReview = () => {
    const data = getData();
    const list = document.createElement("dl");
    reviewOutput.replaceChildren(list);
    addReviewRow(list, "Service", data.service);
    addReviewRow(list, "Project stage", data.projectStage);
    addReviewRow(list, "Project", data.projectName);
    addReviewRow(list, "Problem", data.problem);
    addReviewRow(list, "Budget", data.budget);
    addReviewRow(list, "Timeline", data.timeline);
    addReviewRow(list, "Available", data.needs.join(", ") || "Not specified");
    addReviewRow(list, "Contact", `${data.name} · ${data.email}`);
    addReviewRow(list, "Company", data.company);
    addReviewRow(list, "Link", data.link);

    const body = [
      `Service: ${data.service}`,
      `Project stage: ${data.projectStage}`,
      `Project name: ${data.projectName || "Not specified"}`,
      "",
      "Problem to solve:",
      data.problem,
      "",
      `Budget: ${data.budget}`,
      `Timeline: ${data.timeline}`,
      `Available: ${data.needs.join(", ") || "Not specified"}`,
      "",
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Company: ${data.company || "Not specified"}`,
      `Link: ${data.link || "Not specified"}`,
    ].join("\n");

    emailLink.href = `mailto:ckaushikaadhithya@gmail.com?subject=${encodeURIComponent(`AI project request — ${data.service}`)}&body=${encodeURIComponent(body)}`;
    submitButton.disabled = false;
    submitButton.innerHTML = "Send project request <span>↗</span>";
    submitStatus.textContent = "Nothing has been sent. Submit securely, or use the email fallback if you prefer.";
    submitStatus.classList.remove("is-success", "is-error");
    panels.forEach((panel) => { panel.hidden = true; });
    reviewPanel.hidden = false;
    actions.hidden = true;
    errorMessage.textContent = "";
    progressBar.style.width = "100%";
    stepLabel.textContent = "Ready to review";
    stepName.textContent = "Request summary";
    reviewPanel.focus?.();
  };

  requestForm.addEventListener("input", () => {
    updateSummary();
    saveSessionDraft();
  });
  requestForm.addEventListener("change", () => {
    updateSummary();
    saveSessionDraft();
  });

  nextButton.addEventListener("click", () => {
    if (!validateStep()) return;
    if (activeStep === 4) showReview();
    else showStep(activeStep + 1);
  });

  backButton.addEventListener("click", () => showStep(activeStep - 1));
  editButton.addEventListener("click", () => showStep(4));
  submitButton.addEventListener("click", async () => {
    const data = getData();
    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    submitStatus.textContent = "Saving your request securely…";
    submitStatus.classList.remove("is-success", "is-error");

    try {
      const response = await fetch("https://hjdaprualapvzcsakbcd.supabase.co/functions/v1/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          consent: requestForm.elements.consent.checked,
          referrer: document.referrer,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The request could not be sent.");

      const shortReference = result.reference && result.reference !== "received"
        ? ` Reference: ${String(result.reference).slice(0, 8).toUpperCase()}.`
        : "";
      submitButton.textContent = "Request received";
      submitStatus.textContent = `Thank you — your request is in Kaushik's lead inbox.${shortReference}`;
      submitStatus.classList.add("is-success");
      window.dispatchEvent(new CustomEvent("portfolio:lead-submitted", { detail: { reference: result.reference } }));
      try { sessionStorage.removeItem("kaushik-ai-request"); } catch { /* no-op */ }
    } catch (error) {
      submitButton.disabled = false;
      submitButton.innerHTML = "Try secure submit again <span>↗</span>";
      submitStatus.textContent = `${error.message} You can still use the email fallback.`;
      submitStatus.classList.add("is-error");
    }
  });

  restoreSessionDraft();
  updateSummary();
  showStep(1);
}
