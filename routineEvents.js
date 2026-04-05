// asktru.Routine — routineEvents.js
// HTML-side event handlers for the Routine dashboard

/* global sendMessageToPlugin, _prebuiltGroups */

var currentGroup = 'note';

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
// GROUP SWITCHING (client-side, instant)
// ============================================

function switchGroup(groupBy) {
  currentGroup = groupBy;

  // Update button active state
  document.querySelectorAll('.rt-group-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.group === groupBy);
  });

  // Swap body content from pre-built HTML
  var body = document.getElementById('rtBody');
  if (body && _prebuiltGroups && _prebuiltGroups[groupBy]) {
    var wrapper = document.createElement('div');
    wrapper.insertAdjacentHTML('afterbegin', _prebuiltGroups[groupBy]);
    while (body.firstChild) body.removeChild(body.firstChild);
    while (wrapper.firstChild) body.appendChild(wrapper.firstChild);
  }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  // Delegated click handler
  document.body.addEventListener('click', function(e) {
    // Group-by buttons
    var groupBtn = e.target.closest('.rt-group-btn');
    if (groupBtn) {
      switchGroup(groupBtn.dataset.group);
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
          // Fade out the completed task
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
          sendMessageToPlugin('openNote', JSON.stringify({
            filename: taskEl.dataset.filename,
          }));
        }
        break;
    }
  });
});
