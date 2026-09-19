/*
 * Job Harness Browser Form Engine
 *
 * Derived from Job Application Copilot / OpenJobAutofill form compatibility
 * logic. OpenJobAutofill is MIT-licensed.
 *
 * Copyright (c) 2026 Br1an67
 *
 * This runtime deliberately owns only DOM compatibility:
 * field discovery, site hints, framework-compatible writes and choice/date
 * interaction. It does not own applicant data, job scoring, resume selection,
 * submission authority or application history.
 */
(() => {
  const RUNTIME_VERSION = "openjobautofill-compat-1.0.0";
  if (globalThis.__JOB_HARNESS_FORM_ENGINE__?.version === RUNTIME_VERSION) return;

  const FIELD_ATTR = "data-job-harness-field-id";
  const RADIO_GROUP_ATTR = "data-job-harness-radio-group";
  const CONTROL_SELECTOR = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
    "textarea",
    "select",
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="radio"]',
    '[role="checkbox"]'
  ].join(",");

  const SITE_ADAPTERS = [
    {
      id: "zhiye",
      name: "智易/智业 ATS",
      urlPattern: /(?:^|\.)zhiye\.com$/i,
      confidence: 0.94,
      indicators: [".ant-form-item", ".ant-select", "[class*='form-item']", "[class*='FormItem']"],
      containerSelector: ".ant-form-item,.form-item,[class*='formItem'],[class*='FormItem'],[class*='field'],[class*='Field']",
      labelSelector: ".ant-form-item-label,label,[class*='label'],[class*='Label'],[class*='formLabel']",
      sectionSelector: ".ant-card-head-title,.ant-collapse-header,.form-section-title,[class*='sectionTitle'],[class*='module-title'],h2,h3,h4"
    },
    {
      id: "hotjob",
      name: "HotJob",
      urlPattern: /(?:^|\.)hotjob\.cn$/i,
      confidence: 0.92,
      indicators: [".form-item", ".resume-block", "[class*='kuma']", "[class*='uxcore']"],
      containerSelector: ".form-item,.kuma-form-item,.uxcore-form-row,[class*='form-item'],[class*='field']",
      labelSelector: ".kuma-label,.form-label,label,[class*='label']",
      sectionSelector: ".module-title,.resume-title,.card-title,.uxcore-card-title-text,h2,h3,h4"
    },
    {
      id: "liepin",
      name: "猎聘/通用 ATS",
      urlPattern: /(?:^|\.)liepin\.com$/i,
      confidence: 0.86,
      indicators: [".form-item", "[class*='resume']", "[class*='apply']"],
      containerSelector: ".form-item,[class*='formItem'],[class*='field'],[class*='apply']",
      labelSelector: "label,[class*='label'],[class*='Label']",
      sectionSelector: "[class*='title'],[class*='Title'],h2,h3,h4"
    },
    {
      id: "moka",
      name: "Moka 招聘",
      urlPattern: /(?:^|\.)(?:mokahr|moka)\.com$/i,
      confidence: 0.9,
      indicators: [".ant-form-item", "[class*='application-form']", "[class*='questionnaire']", "[class*='schema-form']"],
      containerSelector: ".ant-form-item,[class*='form-item'],[class*='field-wrapper'],[class*='question-item'],[class*='schema-form-item']",
      labelSelector: ".ant-form-item-label,label,[class*='field-label'],[class*='question-label'],[class*='question-title']",
      sectionSelector: ".ant-card-head-title,[class*='module-title'],[class*='questionnaire-title'],[class*='block-title'],h2,h3,h4"
    },
    {
      id: "beisen",
      name: "北森/iTalentX",
      urlPattern: /(?:^|\.)beisen\.com$|(?:^|\.)italent\.cn$|(?:^|\.)italentx\.cn$|(?:^|\.)italentx\.com$/i,
      confidence: 0.89,
      indicators: [".el-form-item", ".ant-form-item", "[class*='resume-form']", "[class*='talent-form']", "[class*='bs-']"],
      containerSelector: ".el-form-item,.ant-form-item,[class*='form-item'],[class*='resume-field'],[class*='field-row']",
      labelSelector: ".el-form-item__label,.ant-form-item-label,label,[class*='field-label'],[class*='label']",
      sectionSelector: ".el-card__header,[class*='block-title'],[class*='section-title'],[class*='module-title'],h2,h3,h4"
    },
    {
      id: "nowcoder",
      name: "牛客网申",
      urlPattern: /(?:^|\.)nowcoder\.com$/i,
      confidence: 0.84,
      indicators: [".ant-form-item", "[class*='questionnaire']", "[class*='resume-module']", "[class*='form-item']"],
      containerSelector: ".ant-form-item,[class*='form-item'],[class*='question-item'],[class*='resume-field']",
      labelSelector: ".ant-form-item-label,label,[class*='field-label'],[class*='question-title'],[class*='label']",
      sectionSelector: ".ant-card-head-title,[class*='module-title'],[class*='questionnaire-title'],[class*='resume-title'],h2,h3,h4"
    },
    {
      id: "zhaopin",
      name: "智联招聘",
      urlPattern: /(?:^|\.)zhaopin\.com$/i,
      confidence: 0.83,
      indicators: [".ant-form-item", "[class*='resume-edit']", "[class*='questionnaire']", "[class*='form-item']"],
      containerSelector: ".ant-form-item,[class*='form-item'],[class*='resume-field'],[class*='field-row']",
      labelSelector: ".ant-form-item-label,label,[class*='field-label'],[class*='label']",
      sectionSelector: ".ant-card-head-title,[class*='module-title'],[class*='resume-title'],[class*='section-title'],h2,h3,h4"
    },
    {
      id: "feishu-jobs",
      name: "飞书招聘",
      urlPattern: /(?:^|\.)jobs\.feishu\.cn$/i,
      confidence: 0.82,
      indicators: [".ud-formily-item", "[class*='applyFormModuleWrapper']", "[data-form-field-id]", "[data-form-field-name]"],
      containerSelector: ".ud-formily-item,[class*='applyFormModuleWrapper'],[class*='form-item'],[class*='field']",
      labelSelector: ".ud-formily-item-label-content,label,[class*='label'],[data-form-field-i18n-name]",
      sectionSelector: ".applyFormModuleWrapper-text,[class*='module-title'],[class*='section-title'],h2,h3,h4"
    },
    {
      id: "ant-design",
      name: "Ant Design 表单",
      confidence: 0.78,
      indicators: [".ant-form-item", ".ant-select", ".ant-radio-wrapper"],
      containerSelector: ".ant-form-item,.ant-row.ant-form-item,[class*='ant-form-item']",
      labelSelector: ".ant-form-item-label,label,.ant-checkbox-wrapper,.ant-radio-wrapper",
      sectionSelector: ".ant-card-head-title,.ant-collapse-header,.ant-tabs-tab,.ant-typography,h2,h3,h4"
    },
    {
      id: "arco-design",
      name: "Arco Design 表单",
      confidence: 0.77,
      indicators: [".arco-form-item", ".arco-select-view", ".arco-radio"],
      containerSelector: ".arco-form-item,[class*='arco-form-item']",
      labelSelector: ".arco-form-item-label,label,.arco-radio,.arco-checkbox",
      sectionSelector: ".arco-card-header,[class*='section-title'],[class*='module-title'],h2,h3,h4"
    },
    {
      id: "element-ui",
      name: "Element UI 表单",
      confidence: 0.76,
      indicators: [".el-form-item", ".el-select", ".el-radio"],
      containerSelector: ".el-form-item,[class*='el-form-item']",
      labelSelector: ".el-form-item__label,label,.el-checkbox,.el-radio",
      sectionSelector: ".el-card__header,.el-collapse-item__header,[class*='title'],h2,h3,h4"
    },
    {
      id: "tdesign",
      name: "TDesign 表单",
      confidence: 0.75,
      indicators: [".t-form__item", ".t-select", ".t-radio"],
      containerSelector: ".t-form__item,[class*='t-form__item']",
      labelSelector: ".t-form__label,label,.t-radio,.t-checkbox",
      sectionSelector: ".t-card__header,[class*='section-title'],[class*='module-title'],h2,h3,h4"
    }
  ];

  function normalizeText(value, maxLength = 1000) {
    const text = String(value ?? "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  function normalizeMatchKey(value) {
    return normalizeText(value, 500).normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
  }

  function normalizeChoiceLabel(value) {
    return normalizeMatchKey(value)
      .replace(/大学本科/g, "本科")
      .replace(/学校级/g, "校级")
      .replace(/学院级/g, "院级")
      .replace(/离异/g, "离婚");
  }

  function choiceTextMatches(label, target) {
    const left = normalizeChoiceLabel(label);
    const right = normalizeChoiceLabel(target);
    if (!left || !right) return false;
    return left === right || left.includes(right) || right.includes(left);
  }

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
  }

  function getElementText(element) {
    return normalizeText(element?.innerText || element?.textContent || "", 500);
  }

  function getTextWithoutControls(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll("input,textarea,select,button,script,style,svg").forEach((node) => node.remove());
    return normalizeText(clone.innerText || clone.textContent || "", 500);
  }

  function getLabelByFor(element) {
    if (!element.id) return "";
    const escaped = globalThis.CSS?.escape ? CSS.escape(element.id) : element.id;
    return getElementText(document.querySelector(`label[for="${escaped}"]`));
  }

  function getWrappingLabel(element) {
    return getTextWithoutControls(element.closest("label"));
  }

  function getAriaLabelText(element) {
    const aria = normalizeText(element.getAttribute("aria-label"), 500);
    if (aria) return aria;
    const labelledBy = normalizeText(element.getAttribute("aria-labelledby"), 500);
    if (!labelledBy) return "";
    return normalizeText(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "), 500);
  }

  function getClosestDataAttributeValue(element, names, maxDepth = 6) {
    let current = element;
    for (let depth = 0; current && depth <= maxDepth; depth += 1, current = current.parentElement) {
      if (!(current instanceof Element)) continue;
      for (const name of names) {
        const value = normalizeText(current.getAttribute(name), 240);
        if (value) return value;
      }
    }
    return "";
  }

  function getDataAttributeLabelText(element) {
    return getClosestDataAttributeValue(element, [
      "data-form-field-i18n-name",
      "data-form-field-name",
      "data-field-label",
      "data-label",
      "data-title"
    ]);
  }

  function detectSiteAdapter() {
    const hostname = location.hostname || "";
    const href = location.href || "";
    const scored = [];
    for (const adapter of SITE_ADAPTERS) {
      let score = 0;
      const hasUrlPattern = Boolean(adapter.urlPattern);
      const urlMatched = hasUrlPattern && (adapter.urlPattern.test(hostname) || adapter.urlPattern.test(href));
      if (hasUrlPattern && !urlMatched) continue;
      if (urlMatched) score += 70;
      for (const indicator of adapter.indicators || []) {
        try {
          if (document.querySelector(indicator)) score += 8;
        } catch {}
      }
      if (!score) continue;
      const base = adapter.confidence || 0.7;
      scored.push({ ...adapter, confidence: Math.min(0.99, base + score / 100) });
    }
    return scored.sort((left, right) => right.confidence - left.confidence)[0] || null;
  }

  function adapterSelectors() {
    const adapter = detectSiteAdapter();
    return {
      adapter,
      containerSelector: adapter?.containerSelector || "",
      labelSelector: adapter?.labelSelector || "",
      sectionSelector: adapter?.sectionSelector || ""
    };
  }

  function findFieldContainer(element) {
    const { containerSelector } = adapterSelectors();
    if (containerSelector) {
      try {
        const direct = element.closest(containerSelector);
        if (direct) return direct;
      } catch {}
    }
    let current = element.parentElement;
    let best = null;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const text = getTextWithoutControls(current);
      const className = typeof current.className === "string" ? current.className : "";
      const likely = /form|field|item|row|cell|control|input|el-form-item|ant-form-item/i.test(className)
        || current.querySelector("label")
        || /[:：*]/.test(text);
      if (likely && text && text.length <= 220) return current;
      if (!best && text && text.length <= 160) best = current;
    }
    return best || element.parentElement;
  }

  function getAdapterLabelText(element) {
    const { labelSelector } = adapterSelectors();
    const container = findFieldContainer(element);
    if (!container || !labelSelector) return "";
    try {
      return normalizeText([...container.querySelectorAll(labelSelector)].slice(0, 4).map(getElementText).filter(Boolean).join(" | "), 300);
    } catch {
      return "";
    }
  }

  function getNearbyText(element) {
    const parts = [
      getLabelByFor(element),
      getWrappingLabel(element),
      getAriaLabelText(element),
      getDataAttributeLabelText(element),
      getAdapterLabelText(element)
    ];
    const container = findFieldContainer(element);
    if (container) {
      parts.push(getTextWithoutControls(container));
      let previous = container.previousElementSibling;
      for (let index = 0; previous && index < 3; index += 1, previous = previous.previousElementSibling) {
        const text = getElementText(previous);
        if (text && text.length <= 140) {
          parts.push(text);
          break;
        }
      }
    }
    parts.push(
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("title")
    );
    return normalizeText([...new Set(parts.filter(Boolean))].join(" | "), 700);
  }

  function fieldLabel(element) {
    const direct = [
      getLabelByFor(element),
      getDataAttributeLabelText(element),
      getAdapterLabelText(element),
      getWrappingLabel(element),
      getAriaLabelText(element)
    ].map((value) => normalizeText(value, 180)).find(Boolean);
    if (direct) return direct.replace(/^[*＊•\s]+/, "").replace(/[:：]\s*$/, "").trim();
    const nearby = getNearbyText(element);
    const match = nearby.match(/(?:^|\|)\s*[*＊]?\s*([^:：|]{1,80})\s*[:：]/);
    if (match?.[1]) return normalizeText(match[1], 120);
    return normalizeText(element.getAttribute("placeholder") || element.getAttribute("name") || element.id || "", 120);
  }

  function sectionLabel(element) {
    const { sectionSelector } = adapterSelectors();
    const fieldset = element.closest("fieldset");
    const legend = fieldset?.querySelector("legend");
    if (legend && getElementText(legend)) return getElementText(legend);
    const direct = getClosestDataAttributeValue(element, ["data-section-title", "data-module-title", "data-group-title"], 10);
    if (direct) return direct;
    const container = findFieldContainer(element);
    const selectors = [
      "h1","h2","h3","h4","h5","h6","legend","[role='heading']",
      ".title",".section-title",".card-title",sectionSelector
    ].filter(Boolean).join(",");
    if (container && selectors) {
      try {
        const text = getElementText(container.querySelector(selectors));
        if (text) return text;
      } catch {}
    }
    return null;
  }

  function controlKind(element) {
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (element instanceof HTMLSelectElement) return "select";
    if (element.isContentEditable || element.getAttribute("role") === "textbox") return "textarea";
    const role = element.getAttribute("role");
    if (role === "combobox") return "select";
    if (role === "radio") return "radio";
    if (role === "checkbox") return "checkbox";
    if (element instanceof HTMLInputElement) {
      const type = String(element.type || "text").toLowerCase();
      if (type === "search" || type === "month") return "text";
      if (["text","email","tel","url","number","date","radio","checkbox","file"].includes(type)) return type;
    }
    return "unknown";
  }

  function isResumeFileInput(element) {
    if (!(element instanceof HTMLInputElement) || element.type !== "file" || element.disabled) return false;
    const container = findFieldContainer(element);
    const evidence = [
      element.accept,
      element.name,
      element.id,
      typeof element.className === "string" ? element.className : "",
      element.getAttribute("aria-label"),
      getTextWithoutControls(container)
    ].join(" ").toLowerCase();
    return /pdf|docx?|resume|cv|upload|file|简历|附件/.test(evidence);
  }

  function collectVisibleControls() {
    return [...document.querySelectorAll(CONTROL_SELECTOR)]
      .filter((element, index, array) => array.indexOf(element) === index)
      .filter((element) => visible(element) || isResumeFileInput(element));
  }

  function nextStableId(prefix, reserved, used) {
    let index = 0;
    let id = `${prefix}-${index}`;
    while (reserved.has(id) || used.has(id)) id = `${prefix}-${++index}`;
    return id;
  }

  function allocateRefs(elements, attribute, prefix) {
    const existing = elements.map((element) => element.getAttribute(attribute)).filter(Boolean);
    const counts = new Map();
    for (const value of existing) counts.set(value, (counts.get(value) || 0) + 1);
    const reserved = new Set(existing);
    const used = new Set();
    return (element) => {
      const candidate = element.getAttribute(attribute);
      if (candidate && counts.get(candidate) === 1 && !used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
      const id = nextStableId(prefix, reserved, used);
      element.setAttribute(attribute, id);
      reserved.add(id);
      used.add(id);
      return id;
    };
  }

  function findChoiceFieldContainer(element) {
    const { containerSelector } = adapterSelectors();
    if (containerSelector) {
      try {
        const container = element.closest(containerSelector);
        if (container) return container;
      } catch {}
    }
    let current = element;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      if (current.matches?.("[role='combobox'],[role='listbox'],[role='radio'],[role='checkbox'],[class*='select'],[class*='picker'],[class*='dropdown'],label")
        || /select|picker|dropdown|combobox|radio|checkbox|ant-select|el-select|rc-select|cascader|picker/i.test(String(current.className || ""))) {
        return current;
      }
    }
    return element.parentElement || element;
  }

  function visibleChoiceOptions(scope = document) {
    const selectors = [
      '[role="option"]',
      "[aria-selected]",
      "li",
      ".ant-select-item-option",
      ".rc-select-item-option",
      ".ant-cascader-menu-item",
      ".ant-picker-cell",
      ".arco-select-option",
      ".el-select-dropdown__item",
      '[class*="option"]',
      '[class*="Option"]',
      '[class*="select-item"]',
      '[class*="dropdown-item"]'
    ].join(",");
    const seen = new Set();
    const options = [];
    const roots = [scope?.querySelectorAll ? scope : null, document].filter(Boolean);
    for (const root of roots) {
      for (const option of root.querySelectorAll(selectors)) {
        if (!(option instanceof Element) || seen.has(option) || !visible(option)) continue;
        seen.add(option);
        const text = getElementText(option);
        if (text && text.length <= 160) options.push(option);
      }
    }
    return options;
  }

  function leafTextCandidates(text) {
    const expected = normalizeText(text, 160);
    if (!expected) return [];
    const all = [...document.querySelectorAll("*")].filter((element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false;
      const value = getElementText(element);
      if (!value || value.length > 160 || !choiceTextMatches(value, expected)) return false;
      return ![...element.children].some((child) => child instanceof HTMLElement && visible(child) && choiceTextMatches(getElementText(child), expected));
    });
    return all;
  }

  function distanceScore(element, anchor) {
    if (!(element instanceof Element) || !(anchor instanceof Element)) return Number.MAX_SAFE_INTEGER;
    const left = element.getBoundingClientRect();
    const right = anchor.getBoundingClientRect();
    const dx = (left.left + left.width / 2) - (right.left + right.width / 2);
    const dy = (left.top + left.height / 2) - (right.top + right.height / 2);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function bestChoiceCandidate(anchor, target) {
    const candidates = [...new Set([
      ...visibleChoiceOptions(findChoiceFieldContainer(anchor)),
      ...visibleChoiceOptions(document),
      ...leafTextCandidates(target)
    ])].filter((element) => choiceTextMatches(getElementText(element), target)
      || choiceTextMatches(element.getAttribute?.("aria-label") || "", target));
    return candidates.sort((left, right) => distanceScore(left, anchor) - distanceScore(right, anchor))[0] || null;
  }

  function clickActionElement(element) {
    if (!(element instanceof Element)) return false;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    if (element instanceof HTMLElement) element.click();
    else element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function setNativeValue(element, value, blur = true) {
    const stringValue = value == null ? "" : String(value);
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : null;
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    element.focus?.({ preventScroll: true });
    if (descriptor?.set) descriptor.set.call(element, stringValue);
    else element.value = stringValue;
    if (element instanceof HTMLInputElement) element.setAttribute("value", stringValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (blur) element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function normalizedDateParts(value) {
    const text = normalizeText(value, 100);
    let match = text.match(/^(\d{4})[./-](\d{1,2})(?:[./-](\d{1,2}))?$/);
    if (!match) match = text.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日?)?$/);
    if (!match) return null;
    return { year: match[1], month: String(Number(match[2])), day: match[3] ? String(Number(match[3])) : null };
  }

  function normalizeDateComparable(value) {
    const parts = normalizedDateParts(value);
    if (!parts) return normalizeMatchKey(value);
    return [parts.year, parts.month.padStart(2, "0"), parts.day ? parts.day.padStart(2, "0") : null].filter(Boolean).join("-");
  }

  async function fillDatePicker(element, value) {
    const parts = normalizedDateParts(value);
    if (!parts) return { ok: false, reason: "unsupported_date_literal" };
    clickActionElement(element);
    await sleep(160);
    const year = bestChoiceCandidate(element, `${parts.year}年`) || bestChoiceCandidate(element, parts.year);
    if (year) {
      clickActionElement(year);
      await sleep(120);
    }
    const month = bestChoiceCandidate(element, `${parts.month}月`) || bestChoiceCandidate(element, parts.month.padStart(2, "0"));
    if (month) {
      clickActionElement(month);
      await sleep(140);
      return { ok: true, strategy: "picker" };
    }
    if (element instanceof HTMLInputElement && !element.readOnly) {
      setNativeValue(element, [parts.year, parts.month.padStart(2, "0"), parts.day?.padStart(2, "0")].filter(Boolean).join("-"));
      return { ok: true, strategy: "native" };
    }
    return { ok: false, reason: "date_picker_choice_not_found" };
  }

  async function fillCustomChoice(element, value) {
    const target = normalizeText(value, 160);
    const container = findChoiceFieldContainer(element);
    clickActionElement(element);
    if (container && container !== element) clickActionElement(container);
    await sleep(180);

    const direct = bestChoiceCandidate(element, target);
    if (direct) {
      clickActionElement(direct);
      await sleep(120);
      return { ok: true, strategy: "choice" };
    }

    const input = element instanceof HTMLInputElement
      ? element
      : container?.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]')
        || element.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]');
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      if (!input.readOnly) {
        setNativeValue(input, target, false);
        await sleep(180);
        const retry = bestChoiceCandidate(input, target);
        if (retry) {
          clickActionElement(retry);
          await sleep(120);
          return { ok: true, strategy: "search-choice" };
        }
        setNativeValue(input, target, true);
        return { ok: true, strategy: "verified-free-text-candidate" };
      }
    }
    if (input instanceof HTMLElement && input.isContentEditable) {
      input.focus();
      input.textContent = target;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      return { ok: true, strategy: "contenteditable" };
    }
    return { ok: false, reason: "choice_not_found" };
  }

  async function fill(selector, value, options = {}) {
    const element = document.querySelector(selector);
    if (!(element instanceof Element)) return { ok: false, reason: "field_not_found" };
    if (element.getAttribute("aria-disabled") === "true" || element.disabled) return { ok: false, reason: "field_disabled" };
    if (controlKind(element) === "file") return { ok: false, reason: "file_requires_upload" };

    const dateParts = normalizedDateParts(value);
    const context = normalizeMatchKey([fieldLabel(element), getNearbyText(element), element.getAttribute("placeholder")].join(" "));
    if (dateParts && (element.readOnly || /日期|时间|年月|入学|毕业|开始|结束|date|month|year/.test(context))) {
      const result = await fillDatePicker(element, value);
      if (result.ok) return result;
    }

    const role = element.getAttribute("role");
    if (role === "combobox" || controlKind(element) === "select" && !(element instanceof HTMLSelectElement)) {
      const result = await fillCustomChoice(element, value);
      if (result.ok) return result;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.readOnly) {
        const result = await fillCustomChoice(element, value);
        return result.ok ? result : { ok: false, reason: "field_read_only" };
      }
      setNativeValue(element, value, options.blur !== false);
      return { ok: true, strategy: "native-value" };
    }
    if (element.isContentEditable) {
      element.focus();
      element.textContent = String(value ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      if (options.blur !== false) element.dispatchEvent(new Event("blur", { bubbles: true }));
      return { ok: true, strategy: "contenteditable" };
    }

    const editable = element.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]');
    if (editable) return fill(selectorForElement(editable), value, options);
    return { ok: false, reason: "unsupported_text_control" };
  }

  async function select(selector, rawValue) {
    const element = document.querySelector(selector);
    if (!(element instanceof Element)) return { ok: false, reason: "field_not_found" };
    const values = Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue ?? "")];
    const target = values[0] || "";

    if (element instanceof HTMLSelectElement) {
      const wanted = new Set(values.map(normalizeChoiceLabel));
      const matched = [...element.options].filter((option) => wanted.has(normalizeChoiceLabel(option.value)) || wanted.has(normalizeChoiceLabel(option.textContent || "")));
      if (!matched.length) return { ok: false, reason: "select_option_not_found" };
      for (const option of element.options) option.selected = matched.includes(option);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, strategy: "native-select" };
    }

    const nodes = [...document.querySelectorAll(selector)];
    const nativeRadios = nodes.filter((node) => node instanceof HTMLInputElement && node.type === "radio");
    if (nativeRadios.length) {
      const matched = nativeRadios.find((radio) => choiceTextMatches(getChoiceLabelText(radio), target) || choiceTextMatches(radio.value, target));
      if (!matched) return { ok: false, reason: "radio_option_not_found" };
      matched.click();
      matched.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, strategy: "native-radio" };
    }

    return fillCustomChoice(element, target);
  }

  async function setChecked(selector, checked) {
    const element = document.querySelector(selector);
    if (!(element instanceof Element)) return { ok: false, reason: "field_not_found" };
    if (element instanceof HTMLInputElement && ["checkbox","radio"].includes(element.type)) {
      if (element.checked !== checked) element.click();
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, strategy: "native-check" };
    }
    if (["checkbox","radio"].includes(element.getAttribute("role"))) {
      const selected = element.getAttribute("aria-checked") === "true";
      if (selected !== checked) clickActionElement(element);
      return { ok: true, strategy: "role-check" };
    }
    return { ok: false, reason: "unsupported_check_control" };
  }

  function getChoiceLabelText(element) {
    const parent = element.closest("label") || element.parentElement;
    return normalizeText([
      parent ? getElementText(parent) : "",
      parent?.nextElementSibling ? getElementText(parent.nextElementSibling) : "",
      parent?.previousElementSibling ? getElementText(parent.previousElementSibling) : ""
    ].filter(Boolean).join(" "), 160);
  }

  function selectorForElement(element) {
    let id = element.getAttribute(FIELD_ATTR);
    if (!id) {
      id = `jh-engine-${Math.random().toString(36).slice(2, 10)}`;
      element.setAttribute(FIELD_ATTR, id);
    }
    return `[${FIELD_ATTR}="${CSS.escape(id)}"]`;
  }

  function valueMatches(selector, expected) {
    const element = document.querySelector(selector);
    if (!(element instanceof Element)) return false;
    const expectedText = String(expected ?? "");
    let actual = "";
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) actual = String(element.value ?? "");
    else if (element.isContentEditable) actual = String(element.textContent ?? "");
    else actual = String(element.getAttribute("aria-valuetext") || element.getAttribute("aria-label") || getElementText(element));
    if (actual === expectedText) return true;
    const expectedDate = normalizeDateComparable(expectedText);
    const actualDate = normalizeDateComparable(actual);
    return Boolean(expectedDate && actualDate && expectedDate === actualDate);
  }

  function getOptions(element) {
    if (element instanceof HTMLSelectElement) {
      return [...element.options].map((option) => ({ value: option.value, label: normalizeText(option.textContent, 500), disabled: option.disabled }));
    }
    const ariaControls = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
    const root = ariaControls ? document.getElementById(ariaControls) : null;
    if (!root) return [];
    return [...root.querySelectorAll('[role="option"],li,.option')]
      .filter(visible)
      .slice(0, 100)
      .map((option) => ({ value: option.getAttribute("data-value") || getElementText(option), label: getElementText(option), disabled: option.getAttribute("aria-disabled") === "true" }))
      .filter((option) => option.label || option.value);
  }

  function scanControls() {
    const adapter = detectSiteAdapter();
    const controls = collectVisibleControls();
    const regular = controls.filter((element) => !(element instanceof HTMLInputElement && element.type === "radio"));
    const allocateFieldId = allocateRefs(regular, FIELD_ATTR, "jh");
    const results = regular.map((element) => {
      const fieldId = allocateFieldId(element);
      const label = fieldLabel(element);
      const hints = [
        element.getAttribute("autocomplete"),
        element.getAttribute("name"),
        element.id,
        element.getAttribute("placeholder"),
        element.getAttribute("data-field-name"),
        element.getAttribute("data-form-field-name"),
        getNearbyText(element),
        adapter ? `site-adapter:${adapter.id}` : ""
      ].map((value) => normalizeText(value, 300)).filter(Boolean);
      return {
        controlRef: `[${FIELD_ATTR}="${CSS.escape(fieldId)}"]`,
        kind: controlKind(element),
        label,
        name: normalizeText(element.getAttribute("name"), 500) || null,
        description: null,
        required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
        disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        readOnly: Boolean(element.readOnly || element.getAttribute("aria-readonly") === "true"),
        options: getOptions(element),
        semanticHints: [...new Set(hints)].slice(0, 100),
        accept: element instanceof HTMLInputElement && element.type === "file" ? normalizeText(element.accept, 1000) || null : null,
        multiple: Boolean("multiple" in element && element.multiple),
        sectionLabel: sectionLabel(element)
      };
    });

    const nativeRadios = controls.filter((element) => element instanceof HTMLInputElement && element.type === "radio");
    const groups = new Map();
    for (const radio of nativeRadios) {
      const key = radio.name || `__single_${groups.size}`;
      const group = groups.get(key) || [];
      group.push(radio);
      groups.set(key, group);
    }
    const groupEntries = [...groups.entries()];
    const groupElements = groupEntries.map(([, group]) => group[0]);
    const allocateGroupId = allocateRefs(groupElements, RADIO_GROUP_ATTR, "jhr");
    for (const [name, group] of groupEntries) {
      const first = group[0];
      const groupId = allocateGroupId(first);
      for (const radio of group) radio.setAttribute(RADIO_GROUP_ATTR, groupId);
      results.push({
        controlRef: `[${RADIO_GROUP_ATTR}="${CSS.escape(groupId)}"]`,
        kind: "radio",
        label: sectionLabel(first) || fieldLabel(first) || normalizeText(name, 500),
        name: normalizeText(first.name, 500) || null,
        description: null,
        required: group.some((item) => item.required || item.getAttribute("aria-required") === "true"),
        disabled: group.every((item) => item.disabled),
        readOnly: false,
        options: group.map((item) => ({ value: item.value, label: fieldLabel(item) || getChoiceLabelText(item) || normalizeText(item.value, 500), disabled: item.disabled })),
        semanticHints: [...new Set([first.name, first.id, getNearbyText(first), adapter ? `site-adapter:${adapter.id}` : ""].map((value) => normalizeText(value, 300)).filter(Boolean))],
        accept: null,
        multiple: false,
        sectionLabel: sectionLabel(first)
      });
    }

    return results;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  globalThis.__JOB_HARNESS_FORM_ENGINE__ = Object.freeze({
    version: RUNTIME_VERSION,
    upstream: "OpenJobAutofill / Job Application Copilot",
    detectSiteAdapter: () => {
      const adapter = detectSiteAdapter();
      return adapter ? { id: adapter.id, name: adapter.name, confidence: adapter.confidence } : null;
    },
    scanControls,
    fill,
    select,
    setChecked,
    valueMatches
  });
})();