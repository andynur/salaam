# Module and Domain Plan

## Identity and access

Users have role assignments and server-side permissions. Sessions are opaque,
short-lived, rotated on login, and revocable. Sensitive mutations produce audit events.

## Academic foundation

The academic module owns academic years, terms, classes, student memberships, subjects,
courses, and teacher assignments. Composite foreign keys keep classes and terms inside
the same academic year. Historical records are append-oriented in the initial release.

## Learning core

Courses contain modules and lessons. Lessons may reference materials and activities.
Publishing controls student visibility, while progress records learner completion.

## Activity engine

One Activity aggregate supports assignments, quizzes, exams, surveys, questionnaires,
and challenges. Attempts, answers, submissions, grading, and rewards are separate
records linked to the activity.

## Projects and portfolios

Challenges can produce projects. Projects contain teams, Kanban states, reviews, and
showcase eligibility. Published work may appear in a student portfolio.

## Attendance and calendar

Attendance belongs to a defined meeting/session. Calendar events reference their source
entity instead of duplicating deadlines. QR attendance must use short-lived,
server-validated identifiers and must never become a reusable login credential.

## Operations

Audit logs, permission checks, backup status, and operational health belong to the
platform foundation. Future modules must reuse the shared activity, identity, and
audit boundaries.
