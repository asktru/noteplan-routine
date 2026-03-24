// asktru.Routine — script.js
// Todoist-like recurring tasks for NotePlan
// Supports: @repeat(every 3 days), @repeat(every Wed, Fri), @repeat(every 3rd Sunday),
//           @repeat(every 25th), @repeat(every other week), @repeat(3rd, 15th, last), etc.

// ============================================
// CONFIGURATION
// ============================================

var PLUGIN_ID = 'asktru.Routine';

function getSettings() {
  return {
    deleteCompletedRepeat: DataStore.settings.deleteCompletedRepeat || false,
    recentNotesCount: DataStore.settings.recentNotesCount || 5,
    logLevel: DataStore.settings._logLevel || 'INFO',
  };
}

function log(msg) {
  var s = getSettings();
  if (s.logLevel === 'DEBUG') console.log('Routine: ' + msg);
}

function info(msg) {
  console.log('Routine: ' + msg);
}

// ============================================
// DATE UTILITIES
// ============================================

var DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
var DAY_ABBREVS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

function daysInMonth(y, m) {
  if (m === 1 && isLeapYear(y)) return 29;
  return MONTH_DAYS[m];
}

function parseDate(str) {
  if (!str) return null;
  var m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

function formatDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function addDays(d, n) {
  var r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d, n) {
  var r = new Date(d.getTime());
  r.setMonth(r.getMonth() + n);
  // Handle month overflow (e.g., Jan 31 + 1 month = Feb 28)
  if (r.getDate() < d.getDate()) {
    r.setDate(0); // last day of previous month
  }
  return r;
}

function addYears(d, n) {
  var r = new Date(d.getTime());
  r.setFullYear(r.getFullYear() + n);
  return r;
}

/**
 * Get the Nth occurrence of a weekday in a given month.
 * n = 1..5 or -1 for last.
 * weekday = 0 (Sun) .. 6 (Sat)
 */
function nthWeekdayOfMonth(year, month, weekday, n) {
  if (n === -1) {
    // Last occurrence: start from last day of month, go backwards
    var last = new Date(year, month + 1, 0); // last day of month
    var diff = last.getDay() - weekday;
    if (diff < 0) diff += 7;
    return new Date(year, month, last.getDate() - diff);
  }
  // First occurrence
  var first = new Date(year, month, 1);
  var diff2 = weekday - first.getDay();
  if (diff2 < 0) diff2 += 7;
  var day = 1 + diff2 + (n - 1) * 7;
  if (day > daysInMonth(year, month)) return null;
  return new Date(year, month, day);
}

/**
 * Get the last day of a given month.
 */
function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0);
}

// ============================================
// REPEAT EXPRESSION PARSER
// ============================================

/**
 * Parse a Todoist-like repeat expression and return a descriptor object.
 *
 * Supported formats:
 *   "every day" / "every 3 days"
 *   "every week" / "every 2 weeks" / "every other week"
 *   "every month" / "every 3 months"
 *   "every year" / "every 2 years"
 *   "every Mon, Wed, Fri" / "ev Mon, Wed, Fri"
 *   "every 3rd Sunday" / "every last Friday"
 *   "every 25th" / "3rd, 15th, last"
 *   "every other day" / "every other month"
 *   Simple intervals: "1w", "2m", "3d", "+1w", "+2m"
 *
 * Returns: { type: 'interval'|'weekdays'|'monthdays'|'nthWeekday',
 *            ... specific fields per type }
 *         or null if not parseable
 */
function parseRepeatExpr(expr) {
  if (!expr) return null;
  var s = expr.trim().toLowerCase();

  // Strip leading "every " or "ev "
  s = s.replace(/^every\s+/, '').replace(/^ev\s+/, '');

  // --- Simple interval format: [+]Nd, [+]Nw, [+]Nm, [+]Ny ---
  var simpleMatch = s.match(/^(\+)?(\d+)\s*([dwmqy])$/);
  if (simpleMatch) {
    var fromCompletion = Boolean(simpleMatch[1]);
    var num = parseInt(simpleMatch[2]);
    var unitMap = { d: 'day', w: 'week', m: 'month', q: 'quarter', y: 'year' };
    var unit = unitMap[simpleMatch[3]];
    if (unit === 'quarter') { unit = 'month'; num *= 3; }
    if (unit === 'week') { unit = 'day'; num *= 7; }
    return { type: 'interval', unit: unit, count: num, fromCompletion: fromCompletion };
  }

  // --- "other day/week/month/year" ---
  var otherMatch = s.match(/^other\s+(day|week|month|year)s?$/);
  if (otherMatch) {
    var u = otherMatch[1];
    var c = 2;
    if (u === 'week') { u = 'day'; c = 14; }
    return { type: 'interval', unit: u, count: c, fromCompletion: false };
  }

  // --- "N days/weeks/months/years" ---
  var intervalMatch = s.match(/^(\d+)\s+(day|week|month|year)s?$/);
  if (intervalMatch) {
    var n2 = parseInt(intervalMatch[1]);
    var u2 = intervalMatch[2];
    if (u2 === 'week') { u2 = 'day'; n2 *= 7; }
    return { type: 'interval', unit: u2, count: n2, fromCompletion: false };
  }

  // --- "day" / "week" / "month" / "year" (without number = every 1) ---
  var singleMatch = s.match(/^(day|week|month|year)s?$/);
  if (singleMatch) {
    var u3 = singleMatch[1];
    var c3 = 1;
    if (u3 === 'week') { u3 = 'day'; c3 = 7; }
    return { type: 'interval', unit: u3, count: c3, fromCompletion: false };
  }

  // --- Weekday list: "mon, wed, fri" or "monday, wednesday" ---
  var dayTokens = s.split(/[,\s]+/).filter(Boolean);
  var allDays = true;
  var dayIndices = [];
  for (var dt = 0; dt < dayTokens.length; dt++) {
    var tok = dayTokens[dt];
    var dayIdx = DAY_ABBREVS.indexOf(tok.substring(0, 3));
    if (dayIdx === -1) { allDays = false; break; }
    if (dayIndices.indexOf(dayIdx) === -1) dayIndices.push(dayIdx);
  }
  if (allDays && dayIndices.length > 0) {
    dayIndices.sort(function(a, b) { return a - b; });
    return { type: 'weekdays', days: dayIndices, fromCompletion: false };
  }

  // --- "Nth weekday": "3rd sunday", "last friday", "1st monday" ---
  var nthDayMatch = s.match(/^(1st|2nd|3rd|4th|5th|last)\s+(\w+)$/);
  if (nthDayMatch) {
    var nthMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, 'last': -1 };
    var nth = nthMap[nthDayMatch[1]];
    var dayName = nthDayMatch[2].substring(0, 3);
    var dayNum = DAY_ABBREVS.indexOf(dayName);
    if (dayNum >= 0 && nth !== undefined) {
      return { type: 'nthWeekday', nth: nth, weekday: dayNum, fromCompletion: false };
    }
  }

  // --- Month day list: "25th" or "3rd, 15th, last" ---
  var mdTokens = s.split(/[,\s]+/).filter(Boolean);
  var monthDays = [];
  var allMd = true;
  for (var md = 0; md < mdTokens.length; md++) {
    var mdt = mdTokens[md];
    if (mdt === 'last') {
      monthDays.push(-1); // sentinel for "last day of month"
    } else {
      var mdMatch = mdt.match(/^(\d{1,2})(st|nd|rd|th)?$/);
      if (mdMatch) {
        var dayVal = parseInt(mdMatch[1]);
        if (dayVal >= 1 && dayVal <= 31) {
          monthDays.push(dayVal);
        } else { allMd = false; break; }
      } else { allMd = false; break; }
    }
  }
  if (allMd && monthDays.length > 0) {
    monthDays.sort(function(a, b) { return a - b; });
    return { type: 'monthdays', days: monthDays, fromCompletion: false };
  }

  info('Could not parse repeat expression: "' + expr + '"');
  return null;
}

// ============================================
// NEXT DATE CALCULATOR
// ============================================

/**
 * Calculate the next occurrence date given a repeat descriptor and a reference date.
 *
 * @param {object} desc — parsed repeat descriptor from parseRepeatExpr()
 * @param {Date} refDate — the reference date (due date, note date, or completion date)
 * @param {Date} completionDate — when the task was actually completed
 * @returns {Date} — the next occurrence date
 */
function calcNextDate(desc, refDate, completionDate) {
  var base = desc.fromCompletion ? completionDate : refDate;
  if (!base) base = completionDate; // fallback

  switch (desc.type) {
    case 'interval':
      if (desc.unit === 'day') return addDays(base, desc.count);
      if (desc.unit === 'month') return addMonths(base, desc.count);
      if (desc.unit === 'year') return addYears(base, desc.count);
      return addDays(base, desc.count);

    case 'weekdays':
      // Find next day in the list after the reference date
      var currentDay = base.getDay();
      var sorted = desc.days;
      // Find the next day that comes after currentDay
      for (var i = 0; i < sorted.length; i++) {
        if (sorted[i] > currentDay) {
          return addDays(base, sorted[i] - currentDay);
        }
      }
      // Wrap to next week — first day in list
      return addDays(base, 7 - currentDay + sorted[0]);

    case 'monthdays':
      // Find next month-day after base
      var baseDay = base.getDate();
      var baseMonth = base.getMonth();
      var baseYear = base.getFullYear();

      // Check if any day in the list is after baseDay this month
      for (var j = 0; j < desc.days.length; j++) {
        var targetDay = desc.days[j];
        if (targetDay === -1) targetDay = daysInMonth(baseYear, baseMonth);
        if (targetDay > baseDay) {
          var clamped = Math.min(targetDay, daysInMonth(baseYear, baseMonth));
          return new Date(baseYear, baseMonth, clamped);
        }
      }
      // Wrap to next month — first day in list
      var nextMonth = baseMonth + 1;
      var nextYear = baseYear;
      if (nextMonth > 11) { nextMonth = 0; nextYear++; }
      var firstDay = desc.days[0];
      if (firstDay === -1) firstDay = daysInMonth(nextYear, nextMonth);
      firstDay = Math.min(firstDay, daysInMonth(nextYear, nextMonth));
      return new Date(nextYear, nextMonth, firstDay);

    case 'nthWeekday':
      // Find nth weekday of next month (or current month if it's still ahead)
      var nwMonth = base.getMonth();
      var nwYear = base.getFullYear();
      var candidate = nthWeekdayOfMonth(nwYear, nwMonth, desc.weekday, desc.nth);
      if (candidate && candidate > base) return candidate;
      // Try next month
      nwMonth++;
      if (nwMonth > 11) { nwMonth = 0; nwYear++; }
      var next = nthWeekdayOfMonth(nwYear, nwMonth, desc.weekday, desc.nth);
      return next || addDays(base, 28); // fallback

    default:
      return addDays(base, 7); // safe fallback
  }
}

// ============================================
// TASK DETECTION & REPEAT GENERATION
// ============================================

// Regex to detect @repeat(...) — captures the expression inside parens
var RE_REPEAT = /@repeat\(([^)]+)\)/;

// Regex to detect @done(YYYY-MM-DD ...) — captures the date
var RE_DONE = /@done\((\d{4}-\d{2}-\d{2})[^)]*\)/;

// Regex to detect scheduled date >YYYY-MM-DD
var RE_SCHEDULED = />(\d{4}-\d{2}-\d{2})/;

/**
 * Extract the effective "due date" for a task, considering:
 *   1. Explicit >YYYY-MM-DD scheduling
 *   2. Calendar note date (if in a daily/weekly/etc note)
 *   3. Completion date as fallback
 */
function getTaskDueDate(content, note) {
  // Check for explicit scheduled date
  var schedMatch = content.match(RE_SCHEDULED);
  if (schedMatch) return parseDate(schedMatch[1]);

  // Check if this is a calendar note
  if (note && note.type === 'Calendar') {
    var fn = (note.filename || '').replace(/\.\w+$/, '');
    // Daily: YYYYMMDD
    if (/^\d{8}$/.test(fn)) {
      return new Date(parseInt(fn.substring(0, 4)), parseInt(fn.substring(4, 6)) - 1, parseInt(fn.substring(6, 8)));
    }
    // Weekly: YYYY-Www — use Monday of that week
    var weekMatch = fn.match(/^(\d{4})-W(\d{2})$/);
    if (weekMatch) {
      var jan4 = new Date(parseInt(weekMatch[1]), 0, 4);
      var weekNum = parseInt(weekMatch[2]);
      var mondayOfWeek1 = new Date(jan4.getTime());
      mondayOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
      return addDays(mondayOfWeek1, (weekNum - 1) * 7);
    }
    // Monthly: YYYY-MM — use 1st of month
    var monthMatch = fn.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
      return new Date(parseInt(monthMatch[1]), parseInt(monthMatch[2]) - 1, 1);
    }
  }

  return null; // no due date found
}

/**
 * Process a single note: find completed tasks with @repeat(), generate next occurrences.
 * Returns number of repeats generated.
 */
function processNote(note, silent) {
  if (!note || !note.paragraphs) return 0;
  var config = getSettings();
  var paras = note.paragraphs;
  var generated = 0;

  // Collect indices to process (iterate backwards to handle deletions safely)
  var toProcess = [];
  for (var i = 0; i < paras.length; i++) {
    var p = paras[i];
    // Must be a completed task (done) or cancelled (if we wanted to support that)
    if (p.type !== 'done') continue;
    var content = p.content || '';
    if (!RE_REPEAT.test(content) || !RE_DONE.test(content)) continue;
    toProcess.push(i);
  }

  if (toProcess.length === 0) return 0;

  log('Found ' + toProcess.length + ' completed repeat task(s) in: ' + (note.filename || 'unknown'));

  // Process backwards to maintain valid indices
  for (var t = toProcess.length - 1; t >= 0; t--) {
    var idx = toProcess[t];
    var para = note.paragraphs[idx]; // re-read in case of paragraph shifts
    var rawContent = para.content || '';

    // Extract repeat expression
    var repeatMatch = rawContent.match(RE_REPEAT);
    if (!repeatMatch) continue;
    var repeatExpr = repeatMatch[1];

    // Extract completion date
    var doneMatch = rawContent.match(RE_DONE);
    if (!doneMatch) continue;
    var completionDate = parseDate(doneMatch[1]);
    if (!completionDate) continue;

    // Parse the repeat expression
    var desc = parseRepeatExpr(repeatExpr);
    if (!desc) {
      info('Skipping unparseable repeat: "' + repeatExpr + '"');
      continue;
    }

    // Get the task's due date
    var dueDate = getTaskDueDate(rawContent, note);

    // Calculate next occurrence
    var nextDate = calcNextDate(desc, dueDate, completionDate);
    if (!nextDate) {
      info('Could not calculate next date for: "' + repeatExpr + '"');
      continue;
    }

    var nextDateStr = formatDate(nextDate);
    log('Next occurrence: ' + nextDateStr + ' (from "' + repeatExpr + '")');

    // Build the new task content:
    // 1. Remove @done(...) timestamp
    // 2. Remove old >YYYY-MM-DD scheduling (if any)
    // 3. Add new >YYYY-MM-DD scheduling
    var newContent = rawContent;
    newContent = newContent.replace(RE_DONE, '').trim();
    newContent = newContent.replace(/>\d{4}-\d{2}-\d{2}/g, '').trim();
    newContent = newContent.replace(/>today/g, '').trim();
    // Clean up double spaces
    newContent = newContent.replace(/\s{2,}/g, ' ').trim();
    // Add new scheduled date
    newContent = newContent + ' >' + nextDateStr;

    // Determine where to insert the new task
    if (note.type === 'Calendar') {
      // For calendar notes: append to the target date's calendar note
      var targetNote = DataStore.calendarNoteByDateString(nextDateStr.replace(/-/g, ''));
      if (targetNote) {
        // Insert as an open task (preserving original type: task or checklist)
        var rawLine = para.rawContent || '';
        var isChecklist = rawLine.trimStart().startsWith('+');
        if (isChecklist) {
          targetNote.appendParagraph(newContent, 'checklist');
        } else {
          targetNote.appendTodo(newContent);
        }
        log('Appended repeat to calendar note: ' + nextDateStr);
      } else {
        info('Could not find/create calendar note for: ' + nextDateStr);
      }
    } else {
      // For project notes: insert new task before the completed one
      var rawLine2 = para.rawContent || '';
      var isChecklist2 = rawLine2.trimStart().startsWith('+');
      var newPara = {
        type: isChecklist2 ? 'checklist' : 'open',
        content: newContent,
        indents: para.indents || 0,
      };
      note.insertParagraphBeforeParagraph(newContent, para, isChecklist2 ? 'checklist' : 'open');
      log('Inserted repeat before completed task');
    }

    generated++;

    // Optionally delete the completed task
    if (config.deleteCompletedRepeat) {
      // Re-read paragraphs since we inserted above
      var freshParas = note.paragraphs;
      // The completed task index shifted by 1 (since we inserted before)
      var deleteIdx = note.type === 'Calendar' ? idx : idx + 1;
      if (deleteIdx < freshParas.length) {
        note.removeParagraphAtIndex(deleteIdx);
        log('Deleted completed repeat task');
      }
    }
  }

  return generated;
}

/**
 * Get recently edited notes (excluding the current editor note).
 * Returns up to N notes sorted by last modified time descending.
 */
function getRecentNotes(count, excludeFilename) {
  var allNotes = [];

  // Collect from project notes
  var projNotes = DataStore.projectNotes;
  if (projNotes) {
    for (var i = 0; i < projNotes.length; i++) {
      if (projNotes[i].filename === excludeFilename) continue;
      allNotes.push(projNotes[i]);
    }
  }

  // Collect from calendar notes
  var calNotes = DataStore.calendarNotes;
  if (calNotes) {
    for (var j = 0; j < calNotes.length; j++) {
      if (calNotes[j].filename === excludeFilename) continue;
      allNotes.push(calNotes[j]);
    }
  }

  // Sort by changedDate descending
  allNotes.sort(function(a, b) {
    var aDate = a.changedDate ? a.changedDate.getTime() : 0;
    var bDate = b.changedDate ? b.changedDate.getTime() : 0;
    return bDate - aDate;
  });

  return allNotes.slice(0, count);
}

// ============================================
// MAIN COMMANDS
// ============================================

/**
 * Manual command: scan current note + recent notes for completed @repeat() tasks.
 */
async function generateRepeats() {
  try {
    var config = getSettings();
    var totalGenerated = 0;

    // 1. Process the current editor note
    var currentNote = Editor.note;
    if (currentNote) {
      var count = processNote(currentNote, false);
      totalGenerated += count;
    }

    // 2. Process recently edited notes
    var currentFilename = currentNote ? currentNote.filename : '';
    var recentNotes = getRecentNotes(config.recentNotesCount, currentFilename);
    for (var i = 0; i < recentNotes.length; i++) {
      var count2 = processNote(recentNotes[i], true);
      totalGenerated += count2;
    }

    if (totalGenerated > 0) {
      await CommandBar.prompt('Routine', totalGenerated + ' repeat(s) generated.');
    } else {
      await CommandBar.prompt('Routine', 'No completed @repeat() tasks found.');
    }
  } catch (err) {
    console.log('Routine generateRepeats error: ' + String(err));
  }
}

/**
 * Auto-trigger: called by NotePlan's onEditorWillSave event.
 * Silently processes the current note + recent notes.
 */
async function onEditorWillSave() {
  try {
    var config = getSettings();

    // Process current editor note
    var currentNote = Editor.note;
    if (currentNote) {
      processNote(currentNote, true);
    }

    // Process recently edited notes
    var currentFilename = currentNote ? currentNote.filename : '';
    var recentNotes = getRecentNotes(config.recentNotesCount, currentFilename);
    for (var i = 0; i < recentNotes.length; i++) {
      processNote(recentNotes[i], true);
    }
  } catch (err) {
    console.log('Routine onEditorWillSave error: ' + String(err));
  }
}

// ============================================
// EXPORTS
// ============================================

globalThis.generateRepeats = generateRepeats;
globalThis.onEditorWillSave = onEditorWillSave;
