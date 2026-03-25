# Routine for NotePlan

A recurring task plugin for [NotePlan](https://noteplan.co) with Todoist-like repeat syntax. Automatically generates the next occurrence of a repeating task when you complete it.

## Repeat Syntax

Add `@repeat(expression)` to any task or checklist item:

### Interval Repeats

| Syntax | Meaning |
|--------|---------|
| `@repeat(1d)` or `@repeat(day)` | Every day |
| `@repeat(3d)` or `@repeat(3 days)` | Every 3 days |
| `@repeat(1w)` or `@repeat(week)` | Every week |
| `@repeat(2w)` or `@repeat(every 2 weeks)` | Every 2 weeks |
| `@repeat(other week)` | Every other week |
| `@repeat(1m)` or `@repeat(month)` | Every month |
| `@repeat(3m)` or `@repeat(every 3 months)` | Every 3 months |
| `@repeat(1q)` or `@repeat(quarter)` | Every quarter |
| `@repeat(1y)` or `@repeat(year)` | Every year |

### Weekday Repeats

| Syntax | Meaning |
|--------|---------|
| `@repeat(Mon, Wed, Fri)` | Every Monday, Wednesday, and Friday |
| `@repeat(ev Tue, Thu)` | Every Tuesday and Thursday |
| `@repeat(weekdays)` or `@repeat(weekday)` | Monday through Friday |

### Month-day Repeats

| Syntax | Meaning |
|--------|---------|
| `@repeat(25th)` | 25th of every month |
| `@repeat(1st, 15th)` | 1st and 15th of every month |
| `@repeat(3rd, 15th, last)` | 3rd, 15th, and last day of every month |

### Nth Weekday Repeats

| Syntax | Meaning |
|--------|---------|
| `@repeat(3rd Sunday)` | 3rd Sunday of every month |
| `@repeat(1st Monday)` | 1st Monday of every month |
| `@repeat(last Friday)` | Last Friday of every month |

### Prefix Shortcuts

- `every` / `ev` — optional prefix for readability (`@repeat(every 3 days)` = `@repeat(3 days)`)
- Can be omitted entirely: `@repeat(3 days)` works

### Repeat from Completion Date

By default, the next occurrence is calculated from the **scheduled date** of the task. To calculate from the **completion date** instead (useful for habits where regularity matters more than fixed dates):

| Syntax | Meaning |
|--------|---------|
| `@repeat(!3 days)` | 3 days from completion |
| `@repeat(every! 2 weeks)` | 2 weeks from completion |
| `@repeat(+3d)` | 3 days from completion (shorthand) |

If no `@done()` tag is present, the plugin assumes today as the completion date.

## Scheduling Granularity

The plugin preserves NotePlan's scheduling format. If your task uses weekly scheduling, the repeat will too:

| Original | Repeat | New task |
|----------|--------|----------|
| `>2026-03-24` | `@repeat(3d)` | `>2026-03-27` |
| `>2026-W13` | `@repeat(2w)` | `>2026-W15` |
| `>2026-03` | `@repeat(1m)` | `>2026-04` |
| `>2026-Q1` | `@repeat(1q)` | `>2026-Q2` |
| `>2026` | `@repeat(1y)` | `>2027` |

When the repeat unit implies a broader granularity than the original schedule (e.g., `@repeat(2w)` on a daily-scheduled task), the output automatically upgrades to the appropriate format.

## How It Works

### Automatic (recommended)

Add this frontmatter to any note where you want automatic repeat generation:

```yaml
---
triggers: onEditorWillSave => asktru.Routine.onEditorWillSave
---
```

For daily notes, add it to your daily note template so all new notes get it automatically.

When you complete a task with `@repeat()`, the plugin:
1. Detects the newly completed task
2. Calculates the next occurrence
3. Creates a new open task with the updated schedule
4. Strips `@repeat()` from the completed task to prevent duplicates

### Manual

Run the **Generate Repeats** command from NotePlan's command bar (`/generate repeats`). This scans:
- The currently open note
- The 5 most recently edited notes (to catch tasks completed via backlinks)

## Behavior Details

- After generating a repeat, `@repeat()` is **removed** from the completed task — this prevents duplicate generation on subsequent saves
- The new task inherits the original task's type (task `- [ ]` or checklist `+ [ ]`)
- Indentation is preserved for subtasks
- For calendar notes, the new task is appended to the **target date's** calendar note
- For project notes, the new task is inserted **before** the completed task

## Installation

1. Copy the `asktru.Routine` folder into your NotePlan plugins directory:
   ```
   ~/Library/Containers/co.noteplan.NotePlan*/Data/Library/Application Support/co.noteplan.NotePlan*/Plugins/
   ```
2. Restart NotePlan
3. Add the `onEditorWillSave` trigger to your notes or daily note template

## Settings

- **Delete completed repeat tasks** — when enabled, removes the completed task entirely instead of just stripping `@repeat()` (default: off)

## License

MIT
