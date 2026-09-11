# UI/UX & Design System

## 1. Direction

Design inspiration:

**Jira / Atlassian-like productivity UI + HSI Boarding School brand.**

Do not clone Jira pixel-for-pixel.

## 2. Visual personality

- clean,
- professional,
- academic,
- modern,
- compact but not cramped,
- white-dominant,
- navy/blue primary,
- golden yellow accent.

## 3. Suggested tokens

Starting point only; tune against actual HSI logo.

```css
:root {
  --hsi-navy: #0b1f3a;
  --hsi-blue: #1d5fd1;
  --hsi-blue-soft: #eaf2ff;

  --hsi-gold: #eab308;
  --hsi-gold-soft: #fff8d6;

  --surface: #ffffff;
  --background: #f7f8fa;
  --border: #dfe1e6;

  --text: #172b4d;
  --text-muted: #5e6c84;

  --success: #1f845a;
  --warning: #b65c02;
  --danger: #c9372c;
}
```

Avoid using raw color hex throughout components. Use design tokens.

## 4. Teacher/Admin layout

```text
Top bar
  Search
  Notifications
  User

Sidebar
  Dashboard
  Courses
  Activities
  Students
  Attendance
  Projects
  Calendar
  Reports
  Admin
```

Main area supports:

- breadcrumbs,
- page title,
- page action,
- filters,
- dense tables,
- Kanban,
- right-side detail panel when useful.

## 5. Student layout

Prioritize:

1. what should I do now?
2. what is due soon?
3. where did I stop?
4. what did I achieve?

Dashboard:

- continue learning,
- today's tasks,
- next deadlines,
- project status,
- XP/level,
- recent achievements.

Avoid exposing all admin navigation concepts to students.

## 6. Component primitives

Build a small, reusable set first:

- Button
- IconButton
- Input
- Textarea
- Select
- Checkbox
- Radio
- Badge
- Avatar
- Card
- Table
- Tabs
- Dialog
- Dropdown
- Tooltip
- Toast
- EmptyState
- Skeleton
- Pagination
- Breadcrumb
- Progress
- StatusPill

Then domain components.

## 7. Accessibility

- keyboard navigation,
- visible focus,
- semantic labels,
- color is not sole status signal,
- sufficient contrast,
- form error linked to input,
- accessible dialogs,
- table headers.

## 8. Responsive priority

Primary targets:

- desktop/laptop teacher use,
- student laptop/tablet,
- phone usable for quick access/attendance.

Complex course editing and Kanban do not need identical phone UX.

## 9. Performance

- route/page code splitting if needed,
- lazy-load heavy editor,
- optimized images,
- pagination/virtualization only when measured need,
- skeletons for perceived responsiveness,
- avoid shipping large chart libraries before reporting phase.

## 10. UI rules for Codex

Whenever Codex adds UI:

- reuse existing component/token first;
- no arbitrary new colors;
- no duplicate modal/button/input implementation;
- include empty/loading/error state;
- include keyboard/accessibility behavior where applicable;
- maintain student vs teacher information-density distinction.
