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

/**
 * Get ISO week number for a date. Returns { year, week }.
 */
function getISOWeek(d) {
  var dt = new Date(d.getTime());
  dt.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  var jan4 = new Date(dt.getFullYear(), 0, 4);
  var dayDiff = (dt.getTime() - jan4.getTime()) / 86400000;
  var weekNum = 1 + Math.round((dayDiff - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { year: dt.getFullYear(), week: weekNum };
}

/**
 * Get the Monday of a given ISO week.
 */
function mondayOfISOWeek(year, week) {
  var jan4 = new Date(year, 0, 4);
  var mondayW1 = new Date(jan4.getTime());
  mondayW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return addDays(mondayW1, (week - 1) * 7);
}

/**
 * Get the quarter number (1-4) for a date.
 */
function getQuarter(d) {
  return Math.floor(d.getMonth() / 3) + 1;
}

/**
 * Format a scheduling string based on granularity.
 * granularity: 'day' | 'week' | 'month' | 'quarter' | 'year'
 */
function formatScheduleStr(d, granularity) {
  switch (granularity) {
    case 'week':
      var w = getISOWeek(d);
      return w.year + '-W' + String(w.week).padStart(2, '0');
    case 'month':
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    case 'quarter':
      return d.getFullYear() + '-Q' + getQuarter(d);
    case 'year':
      return String(d.getFullYear());
    default:
      return formatDate(d);
  }
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

  // Detect "from completion" modifier: leading "+", trailing/leading "!"
  // Supported: "+3d", "every! 3 days", "ev! Mon", "!3d"
  var fromCompletion = false;
  if (s.charAt(0) === '+' || s.charAt(0) === '!') {
    fromCompletion = true;
    s = s.substring(1).trim();
  }

  // Strip leading "every " or "ev " — also handle "every!" or "ev!"
  s = s.replace(/^every!?\s+/, '').replace(/^ev!?\s+/, '');

  // Check for trailing "!" after stripping every/ev
  if (s.charAt(s.length - 1) === '!' || s.indexOf('!') === 0) {
    fromCompletion = true;
    s = s.replace(/!/g, '').trim();
  }

  // --- Simple interval format: [+]Nd, [+]Nw, [+]Nm, [+]Nq, [+]Ny ---
  var simpleMatch = s.match(/^(\+)?(\d+)\s*([dwmqy])$/);
  if (simpleMatch) {
    if (simpleMatch[1]) fromCompletion = true;
    var num = parseInt(simpleMatch[2]);
    var unitMap = { d: 'day', w: 'week', m: 'month', q: 'quarter', y: 'year' };
    var unit = unitMap[simpleMatch[3]];
    return { type: 'interval', unit: unit, count: num, fromCompletion: fromCompletion };
  }

  // --- "other day/week/month/quarter/year" ---
  var otherMatch = s.match(/^other\s+(day|week|month|quarter|year)s?$/);
  if (otherMatch) {
    return { type: 'interval', unit: otherMatch[1], count: 2, fromCompletion: fromCompletion };
  }

  // --- "N days/weeks/months/quarters/years" ---
  var intervalMatch = s.match(/^(\d+)\s+(day|week|month|quarter|year)s?$/);
  if (intervalMatch) {
    return { type: 'interval', unit: intervalMatch[2], count: parseInt(intervalMatch[1]), fromCompletion: fromCompletion };
  }

  // --- "day" / "week" / "month" / "quarter" / "year" (without number = every 1) ---
  var singleMatch = s.match(/^(day|week|month|quarter|year)s?$/);
  if (singleMatch) {
    return { type: 'interval', unit: singleMatch[1], count: 1, fromCompletion: fromCompletion };
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
    return { type: 'weekdays', days: dayIndices, fromCompletion: fromCompletion };
  }

  // --- "Nth weekday": "3rd sunday", "last friday", "1st monday" ---
  var nthDayMatch = s.match(/^(1st|2nd|3rd|4th|5th|last)\s+(\w+)$/);
  if (nthDayMatch) {
    var nthMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, 'last': -1 };
    var nth = nthMap[nthDayMatch[1]];
    var dayName = nthDayMatch[2].substring(0, 3);
    var dayNum = DAY_ABBREVS.indexOf(dayName);
    if (dayNum >= 0 && nth !== undefined) {
      return { type: 'nthWeekday', nth: nth, weekday: dayNum, fromCompletion: fromCompletion };
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
    return { type: 'monthdays', days: monthDays, fromCompletion: fromCompletion };
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
  if (!base) base = completionDate; // fallback to completion date
  if (!base) base = new Date(); // ultimate fallback to today

  switch (desc.type) {
    case 'interval':
      if (desc.unit === 'day') return addDays(base, desc.count);
      if (desc.unit === 'week') return addDays(base, desc.count * 7);
      if (desc.unit === 'month') return addMonths(base, desc.count);
      if (desc.unit === 'quarter') return addMonths(base, desc.count * 3);
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

// Regex patterns for scheduled dates at various granularities
var RE_SCHED_DAY = />(\d{4}-\d{2}-\d{2})/;
var RE_SCHED_WEEK = />(\d{4}-W\d{2})/;
var RE_SCHED_MONTH = />(\d{4}-\d{2})(?!-\d)/;
var RE_SCHED_QUARTER = />(\d{4}-Q[1-4])/;
var RE_SCHED_YEAR = />(\d{4})(?![-WQ])/;
// Combined regex to strip any scheduled date from content
var RE_SCHED_ANY = />(?:today|tomorrow|yesterday|\d{4}(?:-(?:(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|Q[1-4]|W(?:0[1-9]|[1-4]\d|5[0-3])))?)/g;

/**
 * Extract the effective "due date" and scheduling granularity for a task.
 * Returns { date: Date, granularity: 'day'|'week'|'month'|'quarter'|'year' } or null.
 *
 * Priority: explicit >date in content > calendar note date > null
 */
function getTaskScheduleInfo(content, note) {
  // Check for explicit scheduled dates (most specific first)
  var dayMatch = content.match(RE_SCHED_DAY);
  if (dayMatch) return { date: parseDate(dayMatch[1]), granularity: 'day' };

  var weekMatch = content.match(RE_SCHED_WEEK);
  if (weekMatch) {
    var wp = weekMatch[1].match(/(\d{4})-W(\d{2})/);
    var monday = mondayOfISOWeek(parseInt(wp[1]), parseInt(wp[2]));
    return { date: monday, granularity: 'week' };
  }

  var quarterMatch = content.match(RE_SCHED_QUARTER);
  if (quarterMatch) {
    var qp = quarterMatch[1].match(/(\d{4})-Q([1-4])/);
    var qMonth = (parseInt(qp[2]) - 1) * 3;
    return { date: new Date(parseInt(qp[1]), qMonth, 1), granularity: 'quarter' };
  }

  var monthMatch = content.match(RE_SCHED_MONTH);
  if (monthMatch) {
    var mp = monthMatch[1].match(/(\d{4})-(\d{2})/);
    return { date: new Date(parseInt(mp[1]), parseInt(mp[2]) - 1, 1), granularity: 'month' };
  }

  var yearMatch = content.match(RE_SCHED_YEAR);
  if (yearMatch) {
    return { date: new Date(parseInt(yearMatch[1]), 0, 1), granularity: 'year' };
  }

  // Check if this is a calendar note — infer granularity from note type
  if (note && note.type === 'Calendar') {
    var fn = (note.filename || '').replace(/\.\w+$/, '');
    // Daily: YYYYMMDD
    if (/^\d{8}$/.test(fn)) {
      return {
        date: new Date(parseInt(fn.substring(0, 4)), parseInt(fn.substring(4, 6)) - 1, parseInt(fn.substring(6, 8))),
        granularity: 'day'
      };
    }
    // Weekly: YYYY-Www
    var wkMatch = fn.match(/^(\d{4})-W(\d{2})$/);
    if (wkMatch) {
      return { date: mondayOfISOWeek(parseInt(wkMatch[1]), parseInt(wkMatch[2])), granularity: 'week' };
    }
    // Monthly: YYYY-MM
    var moMatch = fn.match(/^(\d{4})-(\d{2})$/);
    if (moMatch) {
      return { date: new Date(parseInt(moMatch[1]), parseInt(moMatch[2]) - 1, 1), granularity: 'month' };
    }
    // Quarterly: YYYY-Qn
    var qMatch = fn.match(/^(\d{4})-Q([1-4])$/);
    if (qMatch) {
      return { date: new Date(parseInt(qMatch[1]), (parseInt(qMatch[2]) - 1) * 3, 1), granularity: 'quarter' };
    }
    // Yearly: YYYY
    var yMatch = fn.match(/^(\d{4})$/);
    if (yMatch) {
      return { date: new Date(parseInt(yMatch[1]), 0, 1), granularity: 'year' };
    }
  }

  return null;
}

/**
 * Detect if a raw line is a completed task or checklist.
 * Returns { isCompleted, isChecklist } or null.
 */
function detectCompletedLine(line) {
  var trimmed = line.trimStart();
  // Task: "- [x]" or "* [x]"
  if (/^[-*]\s+\[x\]\s/.test(trimmed)) return { isCompleted: true, isChecklist: false };
  // Checklist: "+ [x]"
  if (/^\+\s+\[x\]\s/.test(trimmed)) return { isCompleted: true, isChecklist: true };
  return null;
}

/**
 * Process from raw editor content (string). This is used for onEditorWillSave
 * where note.paragraphs may be stale but Editor.content has the latest changes.
 * Returns number of repeats generated.
 */
function processFromContent(note, editorContent, silent) {
  if (!note || !editorContent) return 0;
  var lines = editorContent.split('\n');
  var generated = 0;
  var linesToInsert = []; // { index, content }
  var linesToModify = []; // { index, content } — strip @repeat from completed line
  var linesToDelete = []; // indices
  var config = getSettings();

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var detected = detectCompletedLine(line);
    if (!detected || !detected.isCompleted) continue;
    if (!RE_REPEAT.test(line)) continue;

    // Extract repeat expression
    var repeatMatch = line.match(RE_REPEAT);
    if (!repeatMatch) continue;
    var repeatExpr = repeatMatch[1];

    // Parse the repeat expression
    var desc = parseRepeatExpr(repeatExpr);
    if (!desc) {
      info('Skipping unparseable repeat: "' + repeatExpr + '"');
      continue;
    }

    // Extract completion date (only required for from-completion mode)
    var completionDate = null;
    var doneMatch = line.match(RE_DONE);
    if (doneMatch) {
      completionDate = parseDate(doneMatch[1]);
    }

    if (desc.fromCompletion && !completionDate) {
      // Task was just completed — assume today as completion date
      completionDate = new Date();
      info('No @done date, assuming today for from-completion repeat');
    }

    info('Found completed repeat at line ' + i + ': ' + line.substring(0, 80));

    // Get the task's schedule info (date + granularity)
    var schedInfo = getTaskScheduleInfo(line, note);
    var dueDate = schedInfo ? schedInfo.date : null;
    var granularity = schedInfo ? schedInfo.granularity : 'day';

    // Infer granularity from repeat descriptor if possible
    // e.g., @repeat(2w) on a daily note should output weekly schedule
    if (desc.type === 'interval') {
      if (desc.unit === 'week' && granularity === 'day') granularity = 'week';
      else if (desc.unit === 'quarter' && (granularity === 'day' || granularity === 'month')) granularity = 'quarter';
      else if (desc.unit === 'year' && granularity !== 'year') granularity = 'year';
      else if (desc.unit === 'month' && granularity === 'day') granularity = 'month';
    }

    // For standard repeats (not from-completion), use scheduled date as base
    // For from-completion repeats, use completion date as base
    var baseDate = desc.fromCompletion ? completionDate : dueDate;

    // Calculate next occurrence
    var nextDate = calcNextDate(desc, baseDate, completionDate);
    if (!nextDate) continue;

    var nextSchedStr = formatScheduleStr(nextDate, granularity);
    info('Next occurrence: ' + nextSchedStr + ' (granularity: ' + granularity + ', from "' + repeatExpr + '")');

    // Build new task content — extract just the task text (after the marker)
    var taskContent = line.replace(/^[\s]*[-*+]\s+\[x\]\s+/, '');
    // Remove @done(...) and old scheduled dates (all formats)
    taskContent = taskContent.replace(RE_DONE, '').trim();
    taskContent = taskContent.replace(RE_SCHED_ANY, '').trim();
    taskContent = taskContent.replace(/\s{2,}/g, ' ').trim();
    // Add new scheduled date in the appropriate format
    taskContent = taskContent + ' >' + nextSchedStr;

    // Determine indentation from original line
    var indentMatch = line.match(/^(\s*)/);
    var indent = indentMatch ? indentMatch[1] : '';

    if (note.type === 'Calendar') {
      // For calendar notes: append to the target date's calendar note
      // Use the appropriate date string format for DataStore lookup
      var targetLookup;
      if (granularity === 'day') {
        targetLookup = formatDate(nextDate).replace(/-/g, '');
      } else if (granularity === 'week') {
        var isoW = getISOWeek(nextDate);
        targetLookup = isoW.year + '-W' + String(isoW.week).padStart(2, '0');
      } else if (granularity === 'month') {
        targetLookup = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0');
      } else if (granularity === 'quarter') {
        targetLookup = nextDate.getFullYear() + '-Q' + getQuarter(nextDate);
      } else {
        targetLookup = String(nextDate.getFullYear());
      }
      var targetNote = DataStore.calendarNoteByDateString(targetLookup);
      if (targetNote) {
        if (detected.isChecklist) {
          targetNote.appendParagraph(taskContent, 'checklist');
        } else {
          targetNote.appendTodo(taskContent);
        }
        info('Appended repeat to calendar note: ' + targetLookup);
      }
    } else {
      // For project notes: insert before the completed task
      var marker = detected.isChecklist ? '+ [ ] ' : '- [ ] ';
      linesToInsert.push({ index: i, content: indent + marker + taskContent });
    }

    // Strip @repeat() from the completed line so it won't trigger again on next save
    if (config.deleteCompletedRepeat) {
      linesToDelete.push(i);
    } else {
      var modifiedLine = line.replace(RE_REPEAT, '').replace(/\s{2,}/g, ' ').trimEnd();
      linesToModify.push({ index: i, content: modifiedLine });
    }

    generated++;
  }

  // Apply modifications, insertions, and deletions to the editor content
  if (linesToInsert.length > 0 || linesToDelete.length > 0 || linesToModify.length > 0) {
    // Apply modifications first (strip @repeat from completed lines)
    for (var mod = 0; mod < linesToModify.length; mod++) {
      lines[linesToModify[mod].index] = linesToModify[mod].content;
    }

    // Process insertions backwards
    for (var k = linesToInsert.length - 1; k >= 0; k--) {
      var ins = linesToInsert[k];
      lines.splice(ins.index, 0, ins.content);
    }

    if (linesToDelete.length > 0) {
      // Adjust indices for insertions
      for (var d = linesToDelete.length - 1; d >= 0; d--) {
        var delIdx = linesToDelete[d];
        // Account for prior insertions
        var offset = 0;
        for (var m = 0; m < linesToInsert.length; m++) {
          if (linesToInsert[m].index <= delIdx) offset++;
        }
        lines.splice(delIdx + offset, 1);
      }
    }

    Editor.content = lines.join('\n');
  }

  return generated;
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
    var content = p.content || '';
    var rawContent = p.rawContent || '';
    // Use rawContent to detect completion (more reliable than p.type)
    var detected = detectCompletedLine(rawContent);
    if (!detected || !detected.isCompleted) continue;
    // Check for @repeat (don't require @done — we can assume today as completion date)
    var checkStr = rawContent || content;
    if (!RE_REPEAT.test(checkStr)) continue;
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

    // Extract completion date (optional — assume today if missing)
    var doneMatch = rawContent.match(RE_DONE);
    var completionDate = doneMatch ? parseDate(doneMatch[1]) : new Date();
    if (!completionDate) completionDate = new Date();

    // Parse the repeat expression
    var desc = parseRepeatExpr(repeatExpr);
    if (!desc) {
      info('Skipping unparseable repeat: "' + repeatExpr + '"');
      continue;
    }

    // Get the task's schedule info (date + granularity)
    var schedInfo = getTaskScheduleInfo(rawContent, note);
    var dueDate = schedInfo ? schedInfo.date : null;
    var granularity = schedInfo ? schedInfo.granularity : 'day';

    // Infer granularity from repeat descriptor
    if (desc.type === 'interval') {
      if (desc.unit === 'week' && granularity === 'day') granularity = 'week';
      else if (desc.unit === 'quarter' && (granularity === 'day' || granularity === 'month')) granularity = 'quarter';
      else if (desc.unit === 'year' && granularity !== 'year') granularity = 'year';
      else if (desc.unit === 'month' && granularity === 'day') granularity = 'month';
    }

    var baseDate = desc.fromCompletion ? completionDate : dueDate;

    // Calculate next occurrence
    var nextDate = calcNextDate(desc, baseDate, completionDate);
    if (!nextDate) {
      info('Could not calculate next date for: "' + repeatExpr + '"');
      continue;
    }

    var nextSchedStr = formatScheduleStr(nextDate, granularity);
    log('Next occurrence: ' + nextSchedStr + ' (granularity: ' + granularity + ', from "' + repeatExpr + '")');

    // Build the new task content:
    // 1. Remove @done(...) timestamp
    // 2. Remove old scheduling (any format)
    // 3. Add new scheduling in the appropriate format
    var newContent = rawContent;
    newContent = newContent.replace(RE_DONE, '').trim();
    newContent = newContent.replace(RE_SCHED_ANY, '').trim();
    newContent = newContent.replace(/\s{2,}/g, ' ').trim();
    newContent = newContent + ' >' + nextSchedStr;

    // Determine where to insert the new task
    if (note.type === 'Calendar') {
      var targetLookup;
      if (granularity === 'day') {
        targetLookup = formatDate(nextDate).replace(/-/g, '');
      } else if (granularity === 'week') {
        var isoW2 = getISOWeek(nextDate);
        targetLookup = isoW2.year + '-W' + String(isoW2.week).padStart(2, '0');
      } else if (granularity === 'month') {
        targetLookup = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0');
      } else if (granularity === 'quarter') {
        targetLookup = nextDate.getFullYear() + '-Q' + getQuarter(nextDate);
      } else {
        targetLookup = String(nextDate.getFullYear());
      }
      var targetNote = DataStore.calendarNoteByDateString(targetLookup);
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

    // Strip @repeat() from the completed task to prevent re-triggering
    if (config.deleteCompletedRepeat) {
      // Re-read paragraphs since we inserted above
      var freshParas = note.paragraphs;
      // The completed task index shifted by 1 (since we inserted before)
      var deleteIdx = note.type === 'Calendar' ? idx : idx + 1;
      if (deleteIdx < freshParas.length) {
        note.removeParagraphAtIndex(deleteIdx);
        log('Deleted completed repeat task');
      }
    } else {
      // Strip @repeat() from the completed line so it won't trigger again
      var freshParas2 = note.paragraphs;
      var modifyIdx = note.type === 'Calendar' ? idx : idx + 1;
      if (modifyIdx < freshParas2.length) {
        var oldContent = freshParas2[modifyIdx].content || '';
        var cleanedContent = oldContent.replace(RE_REPEAT, '').replace(/\s{2,}/g, ' ').trim();
        freshParas2[modifyIdx].content = cleanedContent;
        note.updateParagraph(freshParas2[modifyIdx]);
        log('Stripped @repeat from completed task');
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
async function generateRepeats(noteArg) {
  try {
    var config = getSettings();
    var totalGenerated = 0;

    // If a specific note or filename was passed (e.g., from another plugin), process it directly
    if (noteArg) {
      var targetNote = null;
      if (typeof noteArg === 'object' && noteArg.paragraphs) {
        targetNote = noteArg;
      } else if (typeof noteArg === 'string') {
        // Filename passed — look it up
        targetNote = DataStore.projectNoteByFilename(noteArg);
        if (!targetNote) {
          // Try calendar notes
          var calNotes = DataStore.calendarNotes;
          for (var cn = 0; cn < calNotes.length; cn++) {
            if (calNotes[cn].filename === noteArg) { targetNote = calNotes[cn]; break; }
          }
        }
      }
      if (targetNote) {
        info('Processing specific note: ' + (targetNote.filename || 'unknown'));
        var count0 = processNote(targetNote, true);
        totalGenerated += count0;
        if (totalGenerated > 0) {
          info(totalGenerated + ' repeat(s) generated from passed note');
        }
        return;
      } else {
        info('Could not find note for argument: ' + String(noteArg));
      }
    }

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
    info('onEditorWillSave triggered');
    var config = getSettings();

    // The Editor content reflects the user's latest changes (including newly completed tasks),
    // but note.paragraphs may be stale. Parse the Editor.content directly.
    var currentNote = Editor.note;
    var editorContent = Editor.content || '';

    if (currentNote && editorContent) {
      var count = processFromContent(currentNote, editorContent, true);
      if (count > 0) info('Generated ' + count + ' repeat(s) from editor');
    }

    // Process recently edited notes (these use note.paragraphs which are up-to-date for non-editor notes)
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
