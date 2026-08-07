import { createDialog } from "../components";
import { text } from "../core/locale";

type RoadmapStage = {
  anchor: string;
  title: string;
  status: { kind: string; label: string };
  itemCount: number;
};

type RoadmapState = {
  schemaVersion: number;
  revision: string;
  path: string;
  digest: string;
  suggestedId: string;
  stages: RoadmapStage[];
};

type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: RoadmapState };
};

let cleanup: (() => void) | null = null;

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = labelText;
  label.append(caption, control);
  return label;
}

function initRoadmapEditor(): void {
  cleanup?.();
  cleanup = null;
  const trigger = document.querySelector<HTMLButtonElement>("[data-roadmap-add]");
  const endpoint = window.DocuDocuPage?.runtime === "serve" && window.DocuDocuPage.capabilities?.editor
    ? window.DocuDocuPage.endpoints?.editor
    : "";
  if (!trigger || !endpoint) return;

  const controller = new AbortController();
  const { signal } = controller;
  let state: RoadmapState | null = null;

  const form = document.createElement("form");
  form.className = "roadmap-dialog-form";
  form.noValidate = false;
  const heading = document.createElement("h2");
  heading.textContent = text("features.roadmap.001");
  const description = document.createElement("p");
  description.className = "roadmap-dialog-description";
  description.textContent = text("features.roadmap.009");
  const select = document.createElement("select");
  select.required = true;
  select.name = "stageAnchor";
  const wording = document.createElement("input");
  wording.required = true;
  wording.name = "text";
  wording.type = "text";
  wording.placeholder = text("features.roadmap.004");
  const id = document.createElement("input");
  id.required = true;
  id.name = "id";
  id.type = "text";
  id.autocapitalize = "characters";
  id.spellcheck = false;
  id.pattern = "DLV-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*";
  const hint = document.createElement("small");
  hint.className = "roadmap-id-hint";
  const status = document.createElement("p");
  status.className = "roadmap-dialog-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "roadmap-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "roadmap-dialog-cancel";
  cancel.textContent = text("features.roadmap.007");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "roadmap-dialog-submit";
  submit.textContent = text("features.roadmap.008");
  actions.append(cancel, submit);
  form.append(heading, description, field(text("features.roadmap.002"), select), field(text("features.roadmap.003"), wording), field(text("features.roadmap.005"), id), hint, status, actions);
  const dialog = createDialog(text("features.roadmap.001"), form);
  dialog.dataset.roadmapDialog = "";
  document.body.append(dialog);

  function renderState(next: RoadmapState, preserve: boolean): void {
    const selected = preserve ? select.value : "";
    state = next;
    select.replaceChildren(...next.stages.map((stage) => {
      const option = document.createElement("option");
      option.value = stage.anchor;
      option.textContent = `${stage.title} · ${stage.status.label} · ${stage.itemCount}`;
      option.title = text("features.roadmap.015", [stage.title, stage.itemCount]);
      return option;
    }));
    if (selected && next.stages.some((stage) => stage.anchor === selected)) select.value = selected;
    else if (!preserve) select.value = next.stages.find((stage) => stage.status.kind !== "done")?.anchor || next.stages[0]?.anchor || "";
    if (!preserve || !id.value) id.value = next.suggestedId;
    hint.textContent = text("features.roadmap.006", [next.suggestedId]);
    select.disabled = next.stages.length === 0;
    submit.disabled = next.stages.length === 0;
  }

  async function loadState(preserve: boolean): Promise<void> {
    const response = await fetch(`${endpoint}/roadmap`, { cache: "no-store", credentials: "same-origin", signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `HTTP ${response.status}`);
    renderState(payload as RoadmapState, preserve);
  }

  trigger.addEventListener("click", async () => {
    description.textContent = text("features.roadmap.009");
    status.textContent = "";
    submit.disabled = true;
    dialog.showModal();
    try {
      await loadState(false);
      description.textContent = "";
      select.focus();
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = text("features.roadmap.013", [(error as Error).message]);
    }
  }, { signal });

  cancel.addEventListener("click", () => dialog.close(), { signal });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state || !form.reportValidity()) return;
    submit.disabled = true;
    cancel.disabled = true;
    status.dataset.state = "loading";
    status.textContent = text("features.roadmap.010");
    try {
      const response = await fetch(`${endpoint}/roadmap/items`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Docu-docu-Action": "roadmap-add" },
        body: JSON.stringify({ stageAnchor: select.value, id: id.value, text: wording.value, expectedDigest: state.digest }),
        signal,
      });
      const payload = await response.json().catch(() => ({})) as ErrorEnvelope & { item?: { id: string; stageAnchor: string } };
      if (!response.ok) {
        if (payload.error?.code === "stale_digest" && payload.error.details) {
          renderState(payload.error.details, true);
          status.dataset.state = "conflict";
          status.textContent = text("features.roadmap.012");
          return;
        }
        throw new Error(payload.error?.message || `HTTP ${response.status}`);
      }
      const createdID = payload.item?.id || id.value.toUpperCase();
      status.dataset.state = "success";
      status.textContent = text("features.roadmap.011", [createdID]);
      const stageAnchor = payload.item?.stageAnchor || select.value;
      window.setTimeout(() => {
        window.location.hash = stageAnchor;
        window.location.reload();
      }, 500);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      status.dataset.state = "error";
      status.textContent = text("features.roadmap.014", [(error as Error).message]);
    } finally {
      submit.disabled = false;
      cancel.disabled = false;
    }
  }, { signal });

  cleanup = () => {
    controller.abort();
    dialog.remove();
  };
}

initRoadmapEditor();
document.addEventListener("docu-docu:pagechange", initRoadmapEditor);
