# Browser Form Engine

This package is the DOM-compatibility layer used by Job Harness browser backends.

It is intentionally narrower than Job Harness itself:

- detects known ATS / UI-framework families;
- discovers visible controls and richer labels;
- performs framework-compatible value writes;
- handles custom selects, autocomplete controls, radio/checkbox widgets and date/month pickers;
- does **not** own applicant data, resume selection, job scoring, application history or submit authority.

The browser runtime is derived from the MIT-licensed Job Application Copilot / OpenJobAutofill form engine. Job Harness keeps its own planner, immutable Resume/Application model, execution leases, auditing and submit-safety boundaries above this layer.

Canonical browser artifact: `browser/runtime.js`.
The unpacked Chrome extension receives an exact generated copy at `integrations/browser-extension/form-engine.js`.
