# Phase 24 — Project task metadata

## Scope decisions

- Project cards keep the existing fixed Kanban columns; this increment adds only optional
  card deadlines and up to ten trimmed, unique labels.
- Labels are plain text with a 40-character limit and are stored on the card, so they do not
  introduce a school-wide taxonomy or a new permission model.
- Card metadata follows the existing version check and project edit lock. It is not audited as
  a project-level decision.

## Delivered

- Migration `0021_project_task_metadata.sql` with a matching down script.
- Members and managers can create and edit card labels and deadlines.
- The board displays labels and deadlines while preserving keyboard movement and responsive
  board scrolling.
- Open and archived cards retain their metadata; submitted or approved projects remain locked
  by the existing project lifecycle.

## Validation

- Unit validation covers normalization, bounds, and timestamp parsing.
- Integration coverage exercises the migration and existing project board authorization/version
  behavior with the new fields.

## Boundaries

- custom columns, comments, attachments, card history, and realtime synchronization remain
  deferred
- no shared label catalogue, colors, reminders, or notification delivery is added
