# REBRANDING PROMPT — SALAAM

You are working on an existing internal school application that was previously developed under an older product name.
Github repository also changed to https://github.com/andynur/salaam or git@github.com:andynur/salaam.git for SSH. Please switch to this remote host in the end before committing any changes.

Your task is to perform a **complete but safe product rebranding** to the new official brand:

# SALAAM

## Learn. Build. Grow.

Do not redesign or refactor the application architecture unless required for the rebranding itself.

---

## 1. New Product Identity

The official product name is:

**SALAAM**

Official tagline:

**Learn. Build. Grow.**

Product descriptor:

**Learning & Growth Platform for HSI Boarding School**

Use this naming consistently across all user-facing parts of the application.

---

## 2. Brand Philosophy

SALAAM comes from the Arabic word:

**سلام — Salām**

which carries meanings related to:

* peace,
* safety,
* well-being,
* positive connection,
* and a good environment for growth.

Within the context of HSI Boarding School, SALAAM represents a learning environment where students can safely and purposefully:

* learn new knowledge,
* develop skills,
* complete challenges,
* build meaningful projects,
* collaborate,
* create a portfolio,
* earn achievements,
* and grow both academically and personally.

The product philosophy is summarized through:

### Learn.

Students gain knowledge through:

* courses,
* lessons,
* learning materials,
* quizzes,
* assessments,
* and guided practice.

### Build.

Students transform knowledge into real output through:

* assignments,
* coding challenges,
* projects,
* Kanban workflows,
* teamwork,
* and project showcases.

### Grow.

Students develop continuously through:

* progress tracking,
* skills,
* XP,
* levels,
* badges,
* achievements,
* portfolios,
* feedback,
* and learning milestones.

Therefore:

> **SALAAM is not merely an LMS. It is a Learning & Growth Platform where students Learn, Build, and Grow.**

---

## 3. Rebranding Goal

Replace the old product identity with SALAAM wherever the old name is used as a **brand or product label**.

The final application should consistently present itself as:

```text
SALAAM
Learn. Build. Grow.
```

or, where more context is appropriate:

```text
SALAAM
Learning & Growth Platform
HSI Boarding School
```

---

## 4. First Inspect the Repository

Before modifying anything:

1. Read the root `AGENTS.md` if it exists.
2. Inspect the repository structure.
3. Search globally for:

   * the old app name,
   * old product title,
   * old tagline,
   * old LMS naming,
   * metadata references,
   * application title strings,
   * branding strings.
4. Identify which occurrences are:

   * user-facing branding,
   * documentation,
   * technical identifiers,
   * historical references,
   * package/repository naming.

Do not blindly run global search-and-replace.

Create a short internal plan before editing.

---

## 5. Rebrand User-Facing UI

Update all relevant visible branding.

Check at minimum:

* login page,
* dashboard,
* sidebar,
* navbar,
* header,
* footer,
* browser title,
* page metadata,
* loading screen,
* empty state where the product name appears,
* authentication screen,
* error pages,
* onboarding,
* admin page,
* student dashboard,
* teacher dashboard.

Use:

**SALAAM**

as the primary visible product name.

Use:

**Learn. Build. Grow.**

only where tagline placement is appropriate.

Do not repeat the tagline excessively throughout the interface.

---

## 6. Login Page Direction

The login page should ideally communicate the brand hierarchy as:

```text
SALAAM

Learn. Build. Grow.

Learning & Growth Platform
HSI Boarding School
```

Keep it visually clean.

Do not overload the login page with the complete product philosophy.

---

## 7. Application Shell

Where the application currently shows the old brand in the sidebar/topbar, replace it with:

```text
SALAAM
```

Optional small supporting text:

```text
HSI Boarding School
```

Do not show a long tagline in compact navigation areas unless the layout naturally supports it.

---

## 8. Browser Metadata

Review and update:

* HTML `<title>`
* application metadata
* meta description
* PWA/app manifest if present
* favicon/app-name labels if applicable

Recommended title patterns:

```text
SALAAM — HSI Boarding School
```

or page-specific:

```text
Dashboard | SALAAM
Courses | SALAAM
Projects | SALAAM
```

Recommended description:

```text
SALAAM is the Learning & Growth Platform for HSI Boarding School, helping students learn, build meaningful projects, and grow through challenges, progress, and achievements.
```

---

## 9. README Rebranding

Update the project README.

The opening section should communicate approximately:

```md
# SALAAM

**Learn. Build. Grow.**

SALAAM is the Learning & Growth Platform for HSI Boarding School.

It combines learning, assessment, project-based learning, student portfolio, gamification, attendance, calendar, and classroom workflows in one lightweight internal platform.
```

Include a short philosophy section.

Example:

```md
## Philosophy

SALAAM comes from the Arabic word "Salām" (سلام), representing peace, safety, well-being, and positive growth.

The platform is built around three principles:

- Learn — acquire knowledge and understanding.
- Build — transform learning into projects and real work.
- Grow — develop skills, achievements, and a meaningful portfolio.
```

Do not make README overly marketing-heavy.

Technical documentation remains the primary purpose of README.

---

## 10. Documentation

Search documentation under:

```text
/docs
```

and replace the old product name where it represents the current platform identity.

Examples:

```text
Old Product Name
→
SALAAM
```

and:

```text
Old Product Name is an internal...
→
SALAAM is an internal...
```

Preserve historical or architectural context if changing it would make documentation inaccurate.

---

## 11. AGENTS.md

If `AGENTS.md` exists, update the product identity section to something concise such as:

```md
## Product

SALAAM is the Learning & Growth Platform for HSI Boarding School.

Its product philosophy is:

Learn. Build. Grow.

It combines learning, assessment, projects, portfolio, gamification, attendance, calendar, and classroom operations.
```

Keep `AGENTS.md` concise.

Do not add the full branding philosophy there because this file is loaded frequently by coding agents and should remain token-efficient.

---

## 12. Technical Naming Safety

Very important:

Do NOT automatically rename technical identifiers simply because they contain the old project name.

Examples include:

* database names,
* schema names,
* environment variable names,
* Docker/service identifiers,
* deployment paths,
* Git repository name,
* package name,
* import aliases,
* internal namespace,
* storage paths.

Before changing any of these, determine whether the change is actually necessary.

For the first rebranding pass:

### Change

* visible branding,
* application labels,
* metadata,
* docs,
* README,
* branding constants.

### Preserve by default

* database schema,
* migration history,
* environment variable names,
* existing deployment paths,
* stable internal identifiers.

Avoid unnecessary technical migration risk.

---

## 13. Create a Central Brand Configuration

If branding strings are currently duplicated throughout the source code, consolidate them.

Prefer a simple centralized configuration such as:

```ts
export const BRAND = {
  name: "SALAAM",
  tagline: "Learn. Build. Grow.",
  descriptor: "Learning & Growth Platform",
  organization: "HSI Boarding School",
} as const;
```

Use the existing project architecture and naming convention.

Do not introduce a new abstraction layer merely for four strings.

The goal is to prevent future hard-coded duplicate branding.

---

## 14. Do Not Alter Functional Scope

This task is strictly a branding task.

Do not implement new features such as:

* course features,
* gamification logic,
* attendance,
* exam features,
* Kanban,
* notifications,
* portfolio changes.

Do not refactor unrelated code.

Do not modify database behavior unless branding is stored there and a migration is genuinely necessary.

---

## 15. Visual Brand Direction

Maintain the existing HSI-inspired visual system.

Brand direction:

* dominant white,
* navy,
* blue,
* golden yellow accent,
* clean productivity UI,
* Jira-inspired information hierarchy,
* modern academic feel.

SALAAM should feel:

* modern,
* trustworthy,
* calm,
* purposeful,
* educational,
* Islamic in philosophy without becoming visually overly ornamental.

Avoid adding excessive Arabic ornaments, mosque motifs, crescents, or decorative Islamic patterns unless explicitly requested later.

The Islamic identity should primarily come from:

* the name,
* meaning,
* values,
* tone,
* and philosophy.

---

## 16. Arabic Usage

The Arabic form may appear only in suitable brand/about contexts:

```text
سلام
```

Do not place Arabic text repeatedly across functional UI.

Recommended usage:

```text
SALAAM
سلام
Learn. Build. Grow.
```

only in brand/about/onboarding contexts if visually appropriate.

The primary product name remains:

**SALAAM**

---

## 17. Tone of Voice

SALAAM UI copy should feel:

* encouraging,
* clear,
* concise,
* respectful,
* student-friendly,
* not childish,
* not corporate-heavy.

Examples:

Prefer:

```text
Continue Learning
```

over:

```text
Resume Course Consumption
```

Prefer:

```text
Your Projects
```

over:

```text
Project Management Workspace
```

Prefer:

```text
Keep Growing
```

when motivational language is appropriate.

Do not force "Learn. Build. Grow." into every message.

---

## 18. Search Verification

After modifications, search the entire repository again for the old product name.

Classify remaining occurrences.

For each remaining occurrence decide whether it is:

1. intentionally preserved technical identifier,
2. historical reference,
3. missed branding reference.

Fix all missed branding references.

Do not rename intentional technical identifiers without reason.

---

## 19. Validation

After the rebranding:

Run the project's existing validation commands.

At minimum, if available:

```bash
bun test
bun run typecheck
bun run build
```

Also inspect:

* login page,
* dashboard shell,
* browser title,
* mobile/responsive header if applicable.

Ensure no broken imports or missing assets were introduced.

---

## 20. Completion Report

At the end, provide a concise report containing:

### Rebranded

List key areas updated.

### Intentionally preserved

List old technical identifiers that were deliberately not renamed and explain briefly why.

### Validation

Report:

* tests,
* typecheck,
* build.

### Remaining branding work

Mention only real remaining items such as:

* logo asset,
* favicon,
* social preview,
* final brand guideline,

if they still require design assets.

Do not propose unrelated feature development.

---

## Final Brand Reference

Use this as the source of truth:

```text
SALAAM

Learn. Build. Grow.

Learning & Growth Platform
HSI Boarding School
```

Brand philosophy:

```text
Learn
Acquire knowledge and understanding.

Build
Transform learning into challenges, projects, and meaningful work.

Grow
Develop skills, achievements, character, and a lasting portfolio.
```

SALAAM should be presented as a platform that helps students:

> learn with purpose, build meaningful work, and grow continuously.

Begin by inspecting the existing repository and locating every occurrence of the old product branding before making changes.
