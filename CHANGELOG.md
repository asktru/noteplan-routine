# What's changed in 🔁 Routine plugin?

## [1.2.2] 2026-04-23
### Fixes
- Fixed stale HTML state in the dashboard: completing a task now edits `Editor.content` directly when the note is open, preventing a silent revert on the next Editor save.
- Fixed shifted `data-line-index` values after inserting a new repeat occurrence, which caused subsequent dashboard clicks to target the wrong task.

## [1.2.1] 2026-04-12
### New
- **Routine Dashboard** sidebar view: scan all notes for open `@repeat` tasks, grouped by Note or by Date with instant client-side switching.
- Complete tasks directly from the dashboard — the row updates in place with the next occurrence date, no full rescan.
- Click a repeat badge to edit the rule via a modal; click the date badge to reschedule with a calendar picker.
- **Enable auto-repeat** command: add the `onEditorWillSave` trigger to any note's frontmatter so repeat generation runs automatically on save.
### Fixes
- Fixed phantom empty `@done` lines created by a race between `completeTask` and `onEditorWillSave`.
- Fixed a race condition when rescheduling tasks while the source note was open in split view (stale Editor buffer overwriting plugin changes).

## [1.0.0] 2026-03-24
- Initial release: **generate repeats** command and `onEditorWillSave` trigger for Todoist-like recurring tasks using natural-language `@repeat()` syntax.
- Supports fixed-interval (`@repeat(1w)`) and from-completion (`@repeat(!1w)`) scheduling.
- Supports day, week, month, quarter, and year granularity.
