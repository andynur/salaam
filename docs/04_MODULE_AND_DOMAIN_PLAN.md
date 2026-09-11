# Module & Domain Plan

## 1. Core

### Auth

Responsibilities:

- login/logout,
- password hashing,
- sessions,
- session rotation/revocation,
- password reset flow if added later.

### Permission

Prefer capability-based permission:

```text
course.create
course.update
course.publish
grade.write
grade.publish
attendance.write
project.review
admin.users.manage
```

Role mengelompokkan permission.

### Audit

Record:

- actor,
- action,
- resource type/id,
- timestamp,
- request id,
- relevant metadata.

Do not store password/token secrets in audit metadata.

### Files

Central file service handles:

- file validation,
- safe paths,
- metadata,
- image transform,
- deletion,
- quota.

---

## 2. Academic

Entities:

- academic_years
- terms
- classes
- class_members
- subjects
- teaching_assignments

Rules:

- historical academic records should not silently mutate.
- term/year status: draft/active/closed where useful.

---

## 3. Courses

Entities:

- courses
- course_enrollments
- modules
- lessons
- lesson_resources
- lesson_progress

Common states:

```text
draft
published
archived
```

---

## 4. Activities

Central abstraction.

Entities:

- activities
- activity_items
- activity_item_options
- activity_targets

Possible types:

```text
assignment
quiz
exam
survey
challenge
practice
```

Settings examples:

- time limit,
- attempts,
- randomization,
- grading mode,
- anonymous response,
- late submission,
- reward XP.

---

## 5. Assessment

Entities:

- attempts
- answers
- submissions
- grades
- feedback
- rubrics
- rubric_items

Important invariants:

- one active attempt rule if configured,
- final submit idempotent,
- answer ownership verified server-side,
- server time authoritative,
- score cannot exceed max score without explicit override mechanism.

---

## 6. Attendance

Entities:

- meetings
- attendance_records
- attendance_events

Statuses:

- present
- late
- absent
- excused

Keep change history for teacher/admin corrections.

---

## 7. Projects

Entities:

- projects
- project_members
- project_tasks
- project_columns
- project_reviews
- project_links

A project can link to:

- challenge,
- assignment,
- course,
- team.

---

## 8. Portfolio

Entities:

- portfolios
- portfolio_projects
- skill_tags
- student_skills
- achievements

Portfolio visibility:

- private,
- school-only,
- publishable/public if school policy allows.

---

## 9. Gamification

Entities:

- xp_transactions
- levels
- badges
- badge_rules
- student_badges

Never use only:

```text
users.xp = 3000
```

XP must have ledger source.

Idempotency key prevents double reward.

---

## 10. Calendar

Prefer deriving event when possible:

- exam opens/closes,
- assignment deadline,
- project milestone,
- school event.

Custom events remain possible.

---

## 11. Notifications

Types:

- activity published,
- deadline reminder,
- grade published,
- badge unlocked,
- project review,
- calendar reminder.

V1 channel:

- in-app.

Email/WhatsApp/push can be future adapters.

---

## 12. Reporting

Start from transactional data using well-indexed queries/materialized summary only when required.

Avoid creating analytics infrastructure prematurely.
