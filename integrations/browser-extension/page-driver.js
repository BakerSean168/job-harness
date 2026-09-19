(() => {
  if (globalThis.__jobHarnessPageDriverInstalled) return;
  globalThis.__jobHarnessPageDriverInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "JH_PAGE_DRIVER_COMMAND") return false;
    Promise.resolve().then(() => execute(message.command)).then(sendResponse, (error) => {
      // Returning a rejected promise across chrome.runtime messaging is inconsistent
      // across Chrome versions. Throw inside the response contract instead.
      sendResponse({ __jobHarnessDriverError: sanitize(error) });
    });
    return true;
  });

  async function execute(command) {
    const type = String(command?.type || "");
    const payload = command?.payload || {};
    switch (type) {
      case "body_text": return (document.body?.innerText || "").slice(0, clamp(payload.limit, 0, 200000));
      case "exists": return Boolean(document.querySelector(requiredSelector(payload.selector)));
      case "text": {
        const element = document.querySelector(requiredSelector(payload.selector));
        return element ? compact(element.innerText || element.textContent || "", 50000) : null;
      }
      case "value_matches": return valueMatches(requiredSelector(payload.selector), String(payload.expected ?? ""));
      case "fill": return fill(requiredSelector(payload.selector), String(payload.value ?? ""), payload.blur !== false);
      case "select": return select(requiredSelector(payload.selector), payload.value);
      case "set_checked": return setChecked(requiredSelector(payload.selector), Boolean(payload.checked));
      case "click": return click(requiredSelector(payload.selector), payload.expectedText ?? null);
      case "upload": return upload(requiredSelector(payload.selector), payload.file || {});
      case "scan_controls": return scanControls();
      case "scan_actions": return scanActions();
      case "form_state_hash": return formStateHash();
      default: throw new Error(`Unsupported page-driver command '${type}'`);
    }
  }

  function valueMatches(selector, expected) {
    const element = firstElement(selector);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return String(element.value ?? "") === expected;
    }
    return false;
  }

  function fill(selector, value, blur = true) {
    const element = firstElement(selector);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error("Target is not a text input/textarea");
    if (element.disabled || element.readOnly) throw new Error("Target field is disabled/read-only");
    element.focus({ preventScroll: true });
    setNativeValue(element, value);
    dispatchInputEvents(element, blur);
    return null;
  }

  function select(selector, rawValue) {
    const values = Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue ?? "")];
    const nodes = [...document.querySelectorAll(selector)];
    if (!nodes.length) throw new Error("Select/radio target was not found");
    const first = nodes[0];
    if (first instanceof HTMLSelectElement) {
      const wanted = new Set(values);
      for (const option of first.options) option.selected = wanted.has(option.value) || wanted.has(compact(option.textContent || "", 500));
      first.dispatchEvent(new Event("input", { bubbles: true }));
      first.dispatchEvent(new Event("change", { bubbles: true }));
      return null;
    }
    const radio = nodes.find((node) => node instanceof HTMLInputElement && node.type === "radio" && values.includes(node.value));
    if (!(radio instanceof HTMLInputElement)) throw new Error("No radio option matched the requested value");
    radio.checked = true;
    radio.dispatchEvent(new Event("input", { bubbles: true }));
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    return null;
  }

  function setChecked(selector, checked) {
    const element = firstElement(selector);
    if (!(element instanceof HTMLInputElement) || !["checkbox", "radio"].includes(element.type)) throw new Error("Target is not checkable");
    element.checked = checked;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return null;
  }

  function click(selector, expectedText) {
    const element = firstElement(selector);
    if (!(element instanceof HTMLElement)) throw new Error("Target is not clickable");
    if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") throw new Error("Target action is disabled");
    if (expectedText) {
      const actual = compact(element.innerText || element.textContent || "", 500);
      if (actual !== compact(expectedText, 500)) throw new Error(`Click target text changed: expected '${compact(expectedText, 500)}', got '${actual}'`);
    }
    element.click();
    return null;
  }

  function upload(selector, filePayload) {
    const element = firstElement(selector);
    if (!(element instanceof HTMLInputElement) || element.type !== "file") throw new Error("Target is not a file input");
    const bytes = decodeBase64(String(filePayload.bytesBase64 || ""));
    const file = new File([bytes], String(filePayload.name || "resume.pdf"), { type: String(filePayload.mimeType || "application/pdf") });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    element.files = transfer.files;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return null;
  }

  function scanActions() {
    const standard = [...document.querySelectorAll('a[href],button,[role="button"],[role="option"],[role="menuitem"],[role="radio"],[role="tab"],.ant-select-item-option,.ant-picker-cell')];
    const inferred = [...document.querySelectorAll(
      '[onclick],[tabindex],[class*="apply" i],[class*="deliver" i],[class*="submit" i],[class*="chat" i],[class*="btn" i],[class*="button" i],[class*="action" i]'
    )].filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.matches('a[href],button,[role="button"]')) return true;
      const text = compact(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "", 500);
      if (!text || text.length > 220) return false;
      const className = typeof element.className === "string" ? element.className : "";
      const semantic = /apply|deliver|submit|chat|btn|button|action|投递|申请|沟通/i.test(`${className} ${text}`);
      const tabIndex = Number(element.getAttribute("tabindex") ?? "-1");
      const style = window.getComputedStyle(element);
      return element.hasAttribute("onclick") || tabIndex >= 0 || (style.cursor === "pointer" && semantic);
    });
    const choiceLike = [...document.querySelectorAll('li,div,span')].filter((element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false;
      const text = compact(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "", 500);
      if (!text || text.length > 120) return false;
      const style = window.getComputedStyle(element);
      return style.cursor === "pointer";
    });
    const dateChoices = [...document.querySelectorAll('*')].filter((element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false;
      const text = compact(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "", 500);
      if (!/^\d{4}年$/.test(text) && !/^(?:[1-9]|1[0-2])月$/.test(text)) return false;
      return ![...element.children].some((child) =>
        child instanceof HTMLElement && visible(child) && compact(child.innerText || child.textContent || "", 500) === text
      );
    });
    const candidates = [...new Set([...standard, ...inferred, ...choiceLike, ...dateChoices])]
      .filter((element) => element instanceof HTMLElement && visible(element));
    const elements = candidates
      .filter((element) => {
        const text = compact(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "", 500);
        if (!text) return true;
        return !candidates.some((other) =>
          other !== element &&
          element.contains(other) &&
          compact(other.innerText || other.getAttribute("aria-label") || other.getAttribute("title") || "", 500) === text
        );
      })
      .slice(0, 500);
    const allocate = createStableRefAllocator(elements, "data-job-harness-action-id", "jha");
    return elements.map((element) => {
        const id = allocate(element);
        return {
          actionRef: `[data-job-harness-action-id="${cssEscape(id)}"]`,
          tag: element.tagName.toLowerCase() === "a" ? "a" : element.tagName.toLowerCase() === "button" ? "button" : "other",
          text: compact(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "", 500),
          href: element instanceof HTMLAnchorElement && element.href ? element.href.slice(0, 2000) : null,
          type: element instanceof HTMLButtonElement ? compact(element.type, 100) || null : null,
          role: compact(element.getAttribute("role") || "", 100) || null,
          disabled: element instanceof HTMLButtonElement ? element.disabled : false,
          ariaDisabled: element.getAttribute("aria-disabled") === "true",
        };
      });
  }

  function scanControls() {
    const all = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),textarea,select')]
      .filter((element) => (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && (visible(element) || isResumeFileInput(element)));
    const result = [];
    const radios = new Map();
    const allocateFieldRef = createStableRefAllocator(all, "data-job-harness-field-id", "jh");
    for (let index = 0; index < all.length; index += 1) {
      const element = all[index];
      if (element instanceof HTMLInputElement && element.type === "radio") {
        const key = element.name || `__single_${index}`;
        const group = radios.get(key) || [];
        group.push(element);
        radios.set(key, group);
        continue;
      }
      const id = allocateFieldRef(element);
      result.push(controlSnapshot(element, `[data-job-harness-field-id="${cssEscape(id)}"]`));
    }
    const radioGroups = [...radios.entries()];
    const radioCandidates = radioGroups.map(([, group]) => {
      const values = [...new Set(group.map((item) => item.getAttribute("data-job-harness-radio-group")).filter(Boolean))];
      return values.length === 1 ? values[0] : null;
    });
    const radioCandidateCounts = countStrings(radioCandidates.filter(Boolean));
    const reservedRadioIds = new Set(radioCandidates.filter(Boolean));
    const usedRadioIds = new Set();
    for (let groupIndex = 0; groupIndex < radioGroups.length; groupIndex += 1) {
      const [name, group] = radioGroups[groupIndex];
      const first = group[0];
      const candidate = radioCandidates[groupIndex];
      const id = candidate && radioCandidateCounts.get(candidate) === 1 && !usedRadioIds.has(candidate)
        ? candidate
        : nextStableRef("jhr", reservedRadioIds, usedRadioIds);
      usedRadioIds.add(id);
      reservedRadioIds.add(id);
      for (const item of group) item.setAttribute("data-job-harness-radio-group", id);
      result.push({
        ...controlSnapshot(first, `[data-job-harness-radio-group="${cssEscape(id)}"]`),
        kind: "radio",
        label: sectionLabel(first) || compact(first.getAttribute("aria-label") || name, 1000),
        required: group.some((item) => item.required || item.getAttribute("aria-required") === "true"),
        disabled: group.every((item) => item.disabled),
        readOnly: false,
        options: group.map((item) => ({ value: item.value, label: labelFor(item) || compact(item.value, 500), disabled: item.disabled })),
      });
    }
    return result;
  }

  function isResumeFileInput(element) {
    if (!(element instanceof HTMLInputElement) || element.type !== "file" || element.disabled) return false;
    const evidence = [element.accept, element.name, element.id, typeof element.className === "string" ? element.className : "", element.getAttribute("aria-label") || ""]
      .join(" ")
      .toLowerCase();
    return /pdf|docx?|resume|cv|upload|file|简历|附件/.test(evidence);
  }

  function controlSnapshot(element, controlRef) {
    return {
      controlRef,
      kind: controlKind(element),
      label: labelFor(element),
      name: compact(element.name || "", 500) || null,
      description: descriptionFor(element),
      required: element.required || element.getAttribute("aria-required") === "true",
      disabled: element.disabled,
      readOnly: "readOnly" in element ? Boolean(element.readOnly) : false,
      options: element instanceof HTMLSelectElement ? [...element.options].map((option) => ({ value: option.value, label: compact(option.textContent || "", 500), disabled: option.disabled })) : [],
      semanticHints: [...new Set([element.autocomplete, element.name, element.id, element.getAttribute("placeholder"), element.getAttribute("data-field-name"), element.getAttribute("data-form-field-name")].map((value) => compact(value || "", 240)).filter(Boolean))].slice(0, 100),
      accept: element instanceof HTMLInputElement && element.type === "file" ? compact(element.accept, 1000) || null : null,
      multiple: Boolean("multiple" in element && element.multiple),
      sectionLabel: sectionLabel(element),
    };
  }

  async function formStateHash() {
    const sha256Hex = async (bytes) => {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    };
    const controls = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),textarea,select')]
      .filter((node) => node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement);
    const rows = await Promise.all(controls.map(async (element, index) => {
      const ref = element.getAttribute("data-job-harness-field-id") || element.getAttribute("data-job-harness-radio-group") || element.name || element.id || `control-${index}`;
      let value;
      if (element instanceof HTMLInputElement && element.type === "file") {
        const files = await Promise.all([...(element.files || [])].map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          sha256: await sha256Hex(await file.arrayBuffer()),
        })));
        value = { files };
      } else if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) value = { checked: element.checked, value: String(element.value || "").replace(/\r\n/g, "\n") };
      else if (element instanceof HTMLSelectElement && element.multiple) value = [...element.selectedOptions].map((option) => String(option.value || "").replace(/\r\n/g, "\n")).sort();
      else value = String(element.value || "").replace(/\r\n/g, "\n");
      return [ref, element.tagName.toLowerCase(), element instanceof HTMLInputElement ? element.type : "", value];
    }));
    rows.sort((left, right) => JSON.stringify(left.slice(0, 3)).localeCompare(JSON.stringify(right.slice(0, 3))));
    return sha256Hex(new TextEncoder().encode(JSON.stringify({ url: location.href, rows })));
  }

  function createStableRefAllocator(elements, attribute, prefix) {
    const existing = elements.map((element) => element.getAttribute(attribute)).filter(Boolean);
    const counts = countStrings(existing);
    const reserved = new Set(existing);
    const used = new Set();
    return (element) => {
      const candidate = element.getAttribute(attribute);
      if (candidate && counts.get(candidate) === 1 && !used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
      const id = nextStableRef(prefix, reserved, used);
      element.setAttribute(attribute, id);
      reserved.add(id);
      used.add(id);
      return id;
    };
  }
  function countStrings(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }
  function nextStableRef(prefix, reserved, used) {
    let index = 0;
    let candidate = `${prefix}-${index}`;
    while (reserved.has(candidate) || used.has(candidate)) candidate = `${prefix}-${++index}`;
    return candidate;
  }
  function controlKind(element) {
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (element instanceof HTMLSelectElement) return "select";
    const type = String(element.type || "").toLowerCase();
    if (type === "search") return "text";
    return ["text", "email", "tel", "url", "number", "date", "radio", "checkbox", "file"].includes(type) ? type : "unknown";
  }
  function labelFor(element) {
    if (element.labels?.length) return compact([...element.labels].map((label) => label.textContent || "").join(" "), 1000);
    const aria = compact(element.getAttribute("aria-label") || "", 1000); if (aria) return aria;
    const ids = compact(element.getAttribute("aria-labelledby") || "", 1000);
    if (ids) { const text = ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "); if (compact(text, 1000)) return compact(text, 1000); }
    return compact(element.getAttribute("placeholder") || element.getAttribute("name") || element.id || "", 1000);
  }
  function descriptionFor(element) {
    const ids = compact(element.getAttribute("aria-describedby") || "", 1000); if (!ids) return null;
    return compact(ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "), 2000) || null;
  }
  function sectionLabel(element) {
    const legend = element.closest("fieldset")?.querySelector("legend")?.textContent; if (compact(legend || "", 1000)) return compact(legend, 1000);
    const container = element.closest('[role="group"],section,.form-item,.ant-form-item,.el-form-item');
    const heading = container?.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="label"]')?.textContent;
    return compact(heading || "", 1000) || null;
  }
  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, value); else element.value = value;
  }
  function dispatchInputEvents(element, blur = true) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (blur) element.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  function firstElement(selector) { const element = document.querySelector(selector); if (!element) throw new Error(`Target not found: ${selector}`); return element; }
  function requiredSelector(value) { const selector = String(value || "").trim(); if (!selector || selector.length > 4000) throw new Error("Invalid selector"); return selector; }
  function visible(element) { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; }
  function compact(value, max) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, max); }
  function clamp(value, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : max; }
  function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`); }
  function decodeBase64(value) { const raw = atob(value); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i); return bytes; }
  function sanitize(error) { return (error instanceof Error ? error.message : String(error || "error")).slice(0, 1000); }
})();
