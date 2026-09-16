# Application pipeline specification

## Pipeline vs submission facts

A board card represents one `Application` pipeline, not one form/email submission. If the same Opportunity is submitted again through another channel, Job Harness appends another `application_recorded` timeline event while keeping the same card. This prevents funnel inflation and preserves auditable channel history.

## Default mode: Kanban

Application is a lifecycle/state-machine object, so Board is the primary workspace.

Columns:

```text
Applied | Screening | Assessment | Interview | Offer
```

Terminal applications (`Rejected`, `Withdrawn`) live in a collapsed/archive lane or filtered view rather than permanently consuming the primary board width.

## Card information density

Each card should show:

```text
Company
Role
Location / work mode when known
Applied date
Resume profile/material
Current stage age
Next known event / interview when present
```

Avoid decorative metrics that do not lead to action.

## Drag-and-drop semantics

Dragging a card does not directly mutate `currentStage`.

```text
UI drag
  -> TransitionApplication command
  -> validate domain transition
  -> append ApplicationEvent
  -> update current-stage projection
  -> board refresh/optimistic reconciliation
```

Invalid transitions must snap/revert and display the domain error.

For terminal transitions such as `Rejected` or `Withdrawn`, allow an optional reason/note prompt. Do not require an AI explanation.

## Application detail

### Summary

- Company/Job
- current stage
- applied timestamp
- application channel/listing when known
- resume/materials
- last update

### Timeline

Chronological events are the audit truth:

- application recorded;
- stage changed;
- interview scheduled/completed (V1.1 rich object + event link);
- note added;
- outcome/rejection/withdrawal.

Show actor/provenance (user, ChatGPT Web, import, system, other) when available.

### Interview rounds (V1.1)

A round should have:

- type/round label;
- scheduled time/timezone;
- contacts/interviewers;
- prep notes;
- outcome;
- event linkage.

Do not model five interview rounds as five arbitrary new Application stages.

## Table view

Applications should also offer a dense Table system view for bulk review/export. This reuses the same read model, filters and saved-view model as Board.

## Filters/grouping

- current stage;
- company;
- campaign;
- resume profile/material;
- applied date range;
- stale/attention flag;
- terminal/non-terminal.

## Empty/error behavior

- No applications: show shortlisted Jobs ready to record as applied.
- Transition conflict: retain server truth and surface error; do not silently keep optimistic UI state.
- Repeated Agent write: idempotency key must prevent duplicate events.
