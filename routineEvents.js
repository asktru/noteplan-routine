// asktru.Routine — routineEvents.js
// HTML-side event handlers for the Routine dashboard

/* global sendMessageToPlugin, _prebuiltGroups, _taskCounts */

var currentGroup = 'note';
var currentFilter = 'all';

// ============================================
// PLUGIN MESSAGE HANDLER
// ============================================

function onMessageFromPlugin(type, data) {
  switch (type) {
    case 'SHOW_TOAST':
      showToast(data.message);
      break;
    case 'FULL_REFRESH':
      window.location.reload();
      break;
  }
}

// ============================================
// TOAST
// ============================================

function showToast(message) {
  var toast = document.getElementById('rtToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2000);
}

// ============================================
// SWITCHING (client-side, instant)
// ============================================

function applyView() {
  var key = currentFilter + '_' + currentGroup;
  var body = document.getElementById('rtBody');
  if (body && _prebuiltGroups && _prebuiltGroups[key]) {
    var wrapper = document.createElement('div');
    wrapper.insertAdjacentHTML('afterbegin', _prebuiltGroups[key]);
    while (body.firstChild) body.removeChild(body.firstChild);
    while (wrapper.firstChild) body.appendChild(wrapper.firstChild);
  }
  // Update count
  var countEl = document.getElementById('rtCount');
  if (countEl && _taskCounts) {
    countEl.textContent = (_taskCounts[currentFilter] || 0) + ' tasks';
  }
}

// ============================================
// EDIT REPEAT MODAL
// ============================================

function showEditRepeatModal(taskEl) {
  var filename = taskEl.dataset.filename;
  var lineIndex = taskEl.dataset.lineIndex;
  var badge = taskEl.querySelector('.rt-repeat-badge');
  var currentExpr = badge ? badge.textContent.trim() : '';

  var overlay = document.createElement('div');
  overlay.className = 'rt-modal-overlay';

  var modal = document.createElement('div');
  modal.className = 'rt-modal';

  var title = document.createElement('div');
  title.className = 'rt-modal-title';
  title.textContent = 'Edit Repeat Rule';
  modal.appendChild(title);

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'rt-modal-input';
  input.value = currentExpr;
  input.placeholder = 'e.g. every 3 days, Mon Wed Fri, 3rd Sunday';
  modal.appendChild(input);

  var actions = document.createElement('div');
  actions.className = 'rt-modal-actions';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'rt-modal-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', function() { overlay.remove(); });
  actions.appendChild(cancelBtn);

  var saveBtn = document.createElement('button');
  saveBtn.className = 'rt-modal-btn primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', function() {
    var newExpr = input.value.trim();
    if (!newExpr) { input.style.borderColor = 'var(--rt-red)'; return; }
    sendMessageToPlugin('editRepeat', JSON.stringify({
      filename: filename,
      lineIndex: lineIndex,
      newExpr: newExpr,
    }));
    overlay.remove();
  });
  actions.appendChild(saveBtn);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') saveBtn.click();
    if (e.key === 'Escape') overlay.remove();
  });
  setTimeout(function() { input.focus(); input.select(); }, 50);
}

// ============================================
// CALENDAR PICKER
// ============================================

var calPickerMonth = null;
var calPickerTask = null;

function getISOWeek(d) {
  var dt = new Date(d.getTime());
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  var jan4 = new Date(dt.getFullYear(), 0, 4);
  var dayDiff = (dt.getTime() - jan4.getTime()) / 86400000;
  return { year: dt.getFullYear(), week: 1 + Math.round((dayDiff - 3 + ((jan4.getDay() + 6) % 7)) / 7) };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }
function fmtWeek(y, w) { return y + '-W' + pad2(w); }

function showCalendarPicker(taskEl) {
  removeCalendarPicker();
  var rect = taskEl.getBoundingClientRect();
  var currentDate = taskEl.dataset.date || '';
  var now = new Date();

  calPickerTask = { filename: taskEl.dataset.filename, lineIndex: taskEl.dataset.lineIndex, currentDate: currentDate };
  if (currentDate && currentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    var p = currentDate.split('-');
    calPickerMonth = { year: parseInt(p[0]), month: parseInt(p[1]) - 1 };
  } else {
    calPickerMonth = { year: now.getFullYear(), month: now.getMonth() };
  }

  var picker = document.createElement('div');
  picker.className = 'rt-sched-picker';
  picker.id = 'rtSchedPicker';
  var top = rect.bottom + 4;
  if (top + 340 > window.innerHeight) top = rect.top - 340;
  picker.style.top = Math.max(4, top) + 'px';
  picker.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 310)) + 'px';

  renderCalendar(picker);
  document.body.appendChild(picker);
  setTimeout(function() { document.addEventListener('click', closeCalOnOutside); }, 0);
}

function renderCalendar(picker) {
  if (!picker) picker = document.getElementById('rtSchedPicker');
  if (!picker) return;
  while (picker.firstChild) picker.removeChild(picker.firstChild);

  var year = calPickerMonth.year, month = calPickerMonth.month;
  var today = new Date();
  var todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());
  var currentDate = calPickerTask ? calPickerTask.currentDate : '';
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dayNames = ['MO','TU','WE','TH','FR','SA','SU'];

  // Header
  var header = document.createElement('div');
  header.className = 'rt-cal-header';
  var headerLeft = document.createElement('span');
  headerLeft.className = 'rt-cal-header-date';
  var calIcon = document.createElement('i');
  calIcon.className = 'fa-regular fa-calendar';
  headerLeft.appendChild(calIcon);
  headerLeft.appendChild(document.createTextNode(' ' + (currentDate || 'No date')));
  header.appendChild(headerLeft);
  var clearBtn = document.createElement('button');
  clearBtn.className = 'rt-cal-clear';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    sendMessageToPlugin('scheduleTask', JSON.stringify({ filename: calPickerTask.filename, lineIndex: calPickerTask.lineIndex, dateStr: '' }));
    removeCalendarPicker();
  });
  header.appendChild(clearBtn);
  picker.appendChild(header);

  // Nav
  var nav = document.createElement('div');
  nav.className = 'rt-cal-nav';
  var prevBtn = document.createElement('button');
  prevBtn.className = 'rt-cal-nav-btn';
  prevBtn.textContent = '<';
  prevBtn.addEventListener('click', function(e) { e.stopPropagation(); calPickerMonth.month--; if (calPickerMonth.month < 0) { calPickerMonth.month = 11; calPickerMonth.year--; } renderCalendar(); });
  var nextBtn = document.createElement('button');
  nextBtn.className = 'rt-cal-nav-btn';
  nextBtn.textContent = '>';
  nextBtn.addEventListener('click', function(e) { e.stopPropagation(); calPickerMonth.month++; if (calPickerMonth.month > 11) { calPickerMonth.month = 0; calPickerMonth.year++; } renderCalendar(); });
  var monthLabel = document.createElement('span');
  monthLabel.className = 'rt-cal-month-label';
  monthLabel.textContent = months[month] + ' ' + year;
  nav.appendChild(prevBtn); nav.appendChild(monthLabel); nav.appendChild(nextBtn);
  picker.appendChild(nav);

  // Day names
  var dayHeader = document.createElement('div');
  dayHeader.className = 'rt-cal-grid rt-cal-day-header';
  var wh = document.createElement('span');
  wh.className = 'rt-cal-cell rt-cal-week-head';
  wh.textContent = 'W';
  dayHeader.appendChild(wh);
  for (var dh = 0; dh < 7; dh++) {
    var dhc = document.createElement('span');
    dhc.className = 'rt-cal-cell rt-cal-day-name' + (dh >= 5 ? ' weekend' : '');
    dhc.textContent = dayNames[dh];
    dayHeader.appendChild(dhc);
  }
  picker.appendChild(dayHeader);

  // Grid
  var firstDay = new Date(year, month, 1);
  var startDow = (firstDay.getDay() + 6) % 7;
  var dim = new Date(year, month + 1, 0).getDate();
  var day = 1 - startDow;
  while (day <= dim) {
    var row = document.createElement('div');
    row.className = 'rt-cal-grid';
    var wd = new Date(year, month, Math.max(day, 1));
    var thu = new Date(wd.getTime());
    thu.setDate(thu.getDate() + (3 - ((thu.getDay() + 6) % 7)));
    var iw = getISOWeek(thu);
    var weekStr = fmtWeek(iw.year, iw.week);
    var wc = document.createElement('button');
    wc.className = 'rt-cal-cell rt-cal-week-num' + (currentDate === weekStr ? ' selected' : '');
    wc.textContent = pad2(iw.week);
    wc.dataset.week = weekStr;
    wc.addEventListener('click', function(e) {
      e.stopPropagation();
      sendMessageToPlugin('scheduleTask', JSON.stringify({ filename: calPickerTask.filename, lineIndex: calPickerTask.lineIndex, dateStr: this.dataset.week }));
      removeCalendarPicker();
    });
    row.appendChild(wc);
    for (var dow = 0; dow < 7; dow++) {
      var cell = document.createElement('button');
      cell.className = 'rt-cal-cell rt-cal-day';
      if (day >= 1 && day <= dim) {
        var ds = fmtDate(year, month, day);
        cell.textContent = day;
        cell.dataset.date = ds;
        if (ds === todayStr) cell.classList.add('today');
        if (ds === currentDate) cell.classList.add('selected');
        if (dow >= 5) cell.classList.add('weekend');
        cell.addEventListener('click', function(e) {
          e.stopPropagation();
          sendMessageToPlugin('scheduleTask', JSON.stringify({ filename: calPickerTask.filename, lineIndex: calPickerTask.lineIndex, dateStr: this.dataset.date }));
          removeCalendarPicker();
        });
      } else { cell.classList.add('empty'); }
      row.appendChild(cell);
      day++;
    }
    picker.appendChild(row);
  }
}

function closeCalOnOutside(e) {
  var p = document.getElementById('rtSchedPicker');
  if (p && !p.contains(e.target)) removeCalendarPicker();
}

function removeCalendarPicker() {
  var p = document.getElementById('rtSchedPicker');
  if (p) p.remove();
  calPickerTask = null;
  document.removeEventListener('click', closeCalOnOutside);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  document.body.addEventListener('click', function(e) {
    // Group-by buttons
    var groupBtn = e.target.closest('.rt-group-btn');
    if (groupBtn) {
      currentGroup = groupBtn.dataset.group;
      document.querySelectorAll('.rt-group-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.group === currentGroup); });
      applyView();
      return;
    }

    // Filter buttons
    var filterBtn = e.target.closest('.rt-filter-btn');
    if (filterBtn) {
      currentFilter = filterBtn.dataset.filter;
      document.querySelectorAll('.rt-filter-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.filter === currentFilter); });
      applyView();
      return;
    }

    // Action buttons
    var actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    var action = actionEl.dataset.action;
    var taskEl = actionEl.closest('.rt-task');

    switch (action) {
      case 'completeTask':
        if (taskEl) {
          taskEl.style.opacity = '0.3';
          taskEl.style.pointerEvents = 'none';
          sendMessageToPlugin('completeTask', JSON.stringify({
            filename: taskEl.dataset.filename,
            lineIndex: taskEl.dataset.lineIndex,
          }));
        }
        break;

      case 'openNote':
        if (taskEl) {
          sendMessageToPlugin('openNote', JSON.stringify({ filename: taskEl.dataset.filename }));
        }
        break;

      case 'openGroupNote':
        sendMessageToPlugin('openGroupNote', JSON.stringify({ filename: actionEl.dataset.filename }));
        break;

      case 'openGroupDate':
        sendMessageToPlugin('openGroupDate', JSON.stringify({ date: actionEl.dataset.date }));
        break;

      case 'editRepeat':
        if (taskEl) showEditRepeatModal(taskEl);
        break;

      case 'showSchedule':
        if (taskEl) showCalendarPicker(taskEl);
        break;
    }
  });
});
