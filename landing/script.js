document.documentElement.classList.add("js");

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
        item.textContent = "Copy";
        delete item.dataset.state;
      });
      button.textContent = "Copied";
      button.dataset.state = "copied";
      status.textContent = `${button.closest(".install-command").querySelector(".command-meta span").textContent} command copied.`;
    } catch {
      status.textContent = "Copy is unavailable. Select the command and copy it manually.";
    }
  });
});
