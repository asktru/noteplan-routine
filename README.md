# Routine for NotePlan

Todoist-like recurring tasks for [NotePlan](https://noteplan.co). Supports natural language repeat expressions like `every 3 days`, `every Wed, Fri`, `every 3rd Sunday`, and more.

## Syntax

Add `@repeat(expression)` to any task or checklist item:

| Expression | Meaning |
|------------|---------|
| `@repeat(every day)` | Every day |
| `@repeat(every 3 days)` | Every 3 days |
| `@repeat(every other day)` | Every 2 days |
| `@repeat(every week)` | Every 7 days |
| `@repeat(every 2 weeks)` | Every 14 days |
| `@repeat(every other week)` | Every 14 days |
| `@repeat(every month)` | Every month |
| `@repeat(every 3 months)` | Every 3 months |
| `@repeat(every year)` | Every year |
| `@repeat(every Mon, Wed, Fri)` | On specific weekdays |
| `@repeat(ev Tue, Thu)` | Shorthand for weekdays |
| `@repeat(every 3rd Sunday)` | 3rd Sunday of every month |
| `@repeat(every last Friday)` | Last Friday of every month |
| `@repeat(every 1st Monday)` | 1st Monday of every month |
| `@repeat(every 25th)` | 25th of every month |
| `@repeat(3rd, 15th, last)` | 3rd, 15th, and last day of month |
| `@repeat(1w)` | Simple interval: 1 week |
| `@repeat(+2m)` | 2 months after completion (not due date) |

### Relative vs Completion-based

- **Without `+` prefix**: next date is calculated from the task's due date (or note date for calendar notes)
- **With `+` prefix**: next date is calculated from when you actually completed the task

## How It Works

1. When you complete a task with `@repeat(...)`, the plugin generates a new open copy with the next scheduled date (`>YYYY-MM-DD`)
2. The completed task is kept for reference (or deleted if configured)
3. For **calendar notes**: the new task is appended to the appropriate future daily note
4. For **project notes**: the new task is inserted before the completed one

## Trigger Methods

### Automatic (recommended)

Add this to your note's frontmatter:

```yaml
---
triggers: onEditorWillSave => asktru.Routine.onEditorWillSave
---
```

The plugin will automatically generate repeats whenever you save the note.

### Manual

Run the `/generate repeats` command (alias: `/routine` or `/rpt`) from the command bar.

### Cross-note Detection

The plugin scans not just the current note but also the 5 most recently edited notes. This handles the common case of completing a task via a backlink in a different note.

## Settings

- **Delete completed repeat** — remove the completed task after generating the next occurrence (default: off)
- **Recent notes to scan** — how many recently-edited notes to check beyond the current one (default: 5)

## Installation

1. Copy the `asktru.Routine` folder into your NotePlan plugins directory:
   ```
   ~/Library/Containers/co.noteplan.NotePlan*/Data/Library/Application Support/co.noteplan.NotePlan*/Plugins/
   ```
2. Restart NotePlan
3. Add the trigger frontmatter to notes where you want automatic repeat generation

## License

MIT
