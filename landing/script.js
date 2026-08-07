document.documentElement.classList.add("js");

const localePreferenceKey = "docu-docu-landing-locale";
document.querySelectorAll("[data-locale-choice]").forEach((link) => {
  link.addEventListener("click", () => {
    const locale = link.dataset.localeChoice;
    if (locale !== "ru" && locale !== "en") return;
    try {
      localStorage.setItem(localePreferenceKey, locale);
    } catch {}
  });
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const heroStages = [...document.querySelectorAll(".hero-stage")];

if (reduceMotion) {
  heroStages.forEach((element) => element.classList.add("is-entered"));
} else {
  heroStages.forEach((element, index) => {
    window.setTimeout(() => element.classList.add("is-entered"), 90 + index * 110);
  });
}

const reveals = [...document.querySelectorAll(".reveal")];
if (reduceMotion || !("IntersectionObserver" in window)) {
  reveals.forEach((element) => element.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
  reveals.forEach((element) => observer.observe(element));
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy command was rejected");
}

const status = document.querySelector("#copy-status");
const copyDefault = document.body.dataset.copyDefault ?? "Copy";
const copySuccess = document.body.dataset.copySuccess ?? "Copied";
const copyStatusTemplate = document.body.dataset.copyStatusTemplate ?? "{platform} command copied.";
const copyError = document.body.dataset.copyError ?? "Copy is unavailable. Select the command and copy it manually.";
document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    const text = target?.textContent?.trim() ?? "";
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      document.querySelectorAll("[data-copy-target]").forEach((item) => {
        item.textContent = copyDefault;
        delete item.dataset.state;
      });
      button.textContent = copySuccess;
      button.dataset.state = "copied";
      const platform = button.closest(".install-command").querySelector(".command-meta span").textContent;
      status.textContent = copyStatusTemplate.replace("{platform}", platform);
    } catch {
      status.textContent = copyError;
    }
  });
});
