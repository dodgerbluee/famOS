# Vikunja-Backed Tasks & Chores

## Problem Statement

FamOS currently maintains a self-contained chores system in SQLite alongside a read-only Vikunja integration. This means two parallel task systems with no connection between them. Adults have no task management at all. Chores only apply to kids, and there's no way to organize tasks per family member in a structured project hierarchy. Additionally, "Sanders Cash" is hardcoded throughout the app, making it inflexible for other families.

## Solution

Replace the existing chores system with Vikunja as the source of truth for all task and chore data. FamOS becomes a UI layer over Vikunja — creating projects and tasks via its API, reading them back for display, and layering on famOS-specific concerns (Sanders Cash rewards, kid-friendly chore UI). Each family member gets their own Vikunja sub-project. Adults get a new simple `/tasks` page. The currency name becomes dynamic based on the family name, with an optional custom override.

## User Stories

1. As an admin, I want a Vikunja sub-project automatically created when I add a family member, so that they immediately have a place for tasks.
2. As an admin, I want the Vikunja sub-project named after the family member, so that it's easy to identify in both famOS and Vikunja's native UI.
3. As an admin, I want to create a chore and assign it to one or more kids, so that each kid sees it in their own project.
4. As an admin, I want shared chores to create independent task copies in each assigned kid's project, so that each kid is individually responsible.
5. As an admin, I want to set a chore as daily or weekly, so that Vikunja handles the recurrence automatically.
6. As an admin, I want to set a Sanders Cash reward amount on a chore, so that kids are automatically paid when they complete it.
7. As an admin, I want to delete a family member and have their Vikunja project cleaned up, so that no orphaned data remains.
8. As a kid, I want to see my chores on the `/chores` page with completion toggles, so that I can check off what I've done.
9. As a kid, I want to earn Sanders Cash automatically when I complete a chore, so that I don't have to wait for a parent to manually award it.
10. As a kid, I want each chore completion to be independent from other kids, so that I'm responsible for my own tasks regardless of what siblings do.
11. As a kid, I want to see which chores are shared vs. personal, so that I understand what's expected of me.
12. As a kid, I want to see my reward amount on each chore, so that I know what I'll earn.
13. As an adult (parent/admin), I want a `/tasks` page showing my Vikunja tasks, so that I can manage my own to-do list.
14. As an adult, I want to add a new task from the `/tasks` page, so that I don't have to open Vikunja directly.
15. As an adult, I want to mark tasks as done from the `/tasks` page, so that I can track my progress.
16. As an adult, I want to see due dates and priority on my tasks, so that I can prioritize.
17. As an admin, I want to configure the family name in Settings, so that it flows into the currency name and other family-branded features.
18. As an admin, I want the currency name to default to "[FamilyName] Cash" but be overridable, so that I can call it whatever I want.
19. As a user, I want the currency name to appear correctly throughout the entire app (nav, page titles, transaction labels), so that the branding is consistent.
20. As an admin, I want a "Family" section at the top of the Settings page for family name and currency name, so that these are easy to find and configure.
21. As a user, I want chore completion detection to happen automatically in the background, so that rewards are granted without manual intervention.
22. As an admin, I want to edit a chore template (title, icon, reward, assignment, recurrence), so that I can adjust chores over time.
23. As an admin, I want to deactivate a chore template, so that it stops creating new tasks without losing the definition.

## Implementation Decisions

### Vikunja as source of truth
- The existing `chores` and `chore_completions` SQLite tables remain in the schema but are no longer read or written. No data migration — start fresh.
- All task and chore data lives in Vikunja. FamOS owns reward metadata and assignment rules via a new `chore_templates` table.

### Vikunja project hierarchy
- A top-level Vikunja project named "Family" is created once and its ID stored in `app_settings` as `vikunja_family_project_id`.
- Each family member (all roles: admin, parent, kid) gets a child project under "Family", named after the member (e.g. "Greg", "Nora").
- The Vikunja project ID is stored as a new `vikunja_project_id` column on the `family_members` table.
- On family member deletion, the corresponding Vikunja sub-project is also deleted via the API.

### Chore templates table
```sql
CREATE TABLE IF NOT EXISTS chore_templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT DEFAULT '',
    recurrence TEXT NOT NULL DEFAULT 'daily' CHECK(recurrence IN ('daily', 'weekly', 'once')),
    reward_amount INTEGER NOT NULL DEFAULT 0,
    is_shared BOOLEAN DEFAULT FALSE,
    assigned_members TEXT NOT NULL DEFAULT '[]',
    vikunja_label TEXT NOT NULL DEFAULT '',
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
- `assigned_members` is a JSON array of family member IDs.
- `vikunja_label` is the label string (e.g. `template:<id>`) applied to all Vikunja tasks created from this template, used by the poller to match completions back to templates.
- `is_shared` indicates the chore was assigned to multiple kids (derivable from `assigned_members` length but kept for query convenience).

### Shared chores
- When a chore template is created with multiple assigned members, an independent Vikunja task is created in each member's sub-project.
- Each task is tagged with a `shared` label in addition to the template label.
- Completing one kid's copy does not affect any other kid's copy.
- Each kid earns their own Sanders Cash reward independently upon completion.

### Recurrence
- Vikunja's native recurring task feature is used. FamOS sets `repeat_after` on the Vikunja task: 86400 seconds for daily, 604800 for weekly. `once` tasks have no repeat.
- The existing `date_key`-based recurrence logic in the old chores service is not carried forward.

### Sanders Cash integration
- Rewards are kids-only. Adults do not earn currency for task completion.
- A background poller runs every 2 minutes via the existing scheduler.
- The poller fetches recently-completed tasks from Vikunja, matches them to `chore_templates` via the `vikunja_label`, and awards Sanders Cash to the completing member.
- A tracking mechanism (e.g. storing processed Vikunja task IDs or completion timestamps) prevents double-awarding.
- When a chore template's `assigned_members` is updated to remove a member, their Vikunja task for that template is deleted.

### Vikunja service extension
- `service/vikunja.go` gains write methods: `CreateProject`, `DeleteProject`, `CreateTask`, `UpdateTask`, `CompleteTask`, `DeleteTask`, `CreateLabel`, `GetCompletedTasks`.
- All Vikunja interactions continue to go through this single service.

### Family member lifecycle changes
- `api/family.go` Create handler: after inserting the member, call Vikunja API to create a sub-project under "Family", store the returned project ID on the member row. (Extends the existing pattern of creating a Sanders Cash account for kids.)
- `api/family.go` Delete handler: delete the member's Vikunja sub-project, update any `chore_templates` that referenced the member in `assigned_members`.

### Pages and routing
- `/chores` — kids-only chore page. Keeps the existing UI feel (icons, colored completion circles, reward badges). Only shows kid members. Backed by chore templates + Vikunja task status.
- `/tasks` — new adult-only page. Simple task list: title, due date, priority indicator, done toggle. Ability to add new tasks (title + optional due date). No reward integration.
- The existing Chores component is rewritten to read from Vikunja instead of the old `/api/chores` endpoints.

### Dynamic currency name
- Resolution order: (1) `app_settings` key `currency_name` if set, use it exactly; (2) otherwise, `families.name` + " Cash".
- A new API endpoint (or extension of existing settings endpoint) returns the resolved currency name.
- All hardcoded "Sanders Cash" references in the frontend are replaced with the dynamic value. This includes: nav items, page titles, transaction labels, reward store references, chore reward badges.
- The Settings UI gets a new "Family" section at the top with: Family Name (text input, from `families.name`) and Currency Name (text input, optional, placeholder shows auto-derived name).

### Settings UI
- New "Family" section at top of Settings page with Family Name and Currency Name fields.
- Family Name updates `families.name`.
- Currency Name saves to `app_settings.currency_name` only if the user provides a custom value. Clearing it reverts to the auto-derived name.

## Testing Decisions

- No existing test suite in the codebase. Tests are out of scope for this spec but the following seams are well-suited for future testing:
  - Vikunja service methods — mock the HTTP client, verify correct API calls are made for project/task CRUD.
  - Background poller — verify that completed tasks are matched to templates and Sanders Cash is awarded exactly once.
  - Currency name resolution — verify the fallback chain (custom override → family name + "Cash").
  - Chore template assignment logic — verify shared chores create the right number of Vikunja tasks and that member removal cleans up correctly.

## Out of Scope

- Migrating existing chore data from SQLite to Vikunja.
- Dropping the old `chores` / `chore_completions` tables.
- Rich Vikunja features on the `/tasks` page (descriptions, comments, subtasks, buckets, labels).
- Vikunja webhook integration (polling is used instead).
- Kids having access to the `/tasks` page or adults appearing on the `/chores` page.
- Renaming database tables or API route paths from `sanders_cash` to a dynamic name.

## Further Notes

- The Vikunja API key and URL are already configured in `app_settings`. The implementation assumes a single Vikunja user/API key with permission to manage all projects and tasks.
- If the "Family" parent project or a member's sub-project is deleted directly in Vikunja, famOS should handle the missing project gracefully (re-create on next access or surface an error in Settings).
- The old `/api/chores` endpoints can be kept temporarily for backwards compatibility but should eventually be removed once the new system is stable.
