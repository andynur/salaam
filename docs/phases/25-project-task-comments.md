# Phase 25 — Project task comments

## Scope decisions

- Comments are attached to an existing project card and are visible to project members and
  managers through the existing project access rules.
- Comments are append-only notes, limited to 2,000 characters and 100 displayed entries per
  card. There is no edit or delete workflow in this phase.
- A submitted or approved project remains readable, but its comments are locked against new
  writes. Comments do not introduce a new capability, chat channel, or realtime transport.

## Delivered

- Migration `0022_project_task_comments.sql` with a matching down script and a composite
  foreign key that prevents a comment from pointing at a task in another project.
- Authenticated GET and POST endpoints under
  `/api/projects/:projectId/tasks/:taskId/comments`.
- Board task detail shows chronological comments and lets editable project members add notes.
- New comments update the project's activity timestamp without creating audit noise for ordinary
  collaboration notes.

## Validation

- Unit validation covers trimming, empty bodies, and the 2,000-character bound.
- PostgreSQL integration coverage checks creation, listing, member visibility, outsider denial,
  and invalid input, alongside migration rollback coverage.

## Boundaries

- custom columns, attachments, card history, mentions, notifications, and realtime
  synchronization remain deferred
- no comment editing/deletion, moderation workflow, or full project chat is added
