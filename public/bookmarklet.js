(function () {
  // Chrome blocks a saucedemo.com (public) page from directly fetching a
  // localhost (private) server - "Private Network Access". So this code
  // never fetches localhost itself; it opens/reuses a small same-origin
  // helper tab (pin-relay.html) and talks to it over postMessage, which
  // isn't subject to that restriction. The helper tab does the real
  // same-origin fetch to our API.
  var RELAY_URL = 'http://localhost:4317/pin-relay.html';
  var RELAY_ORIGIN = 'http://localhost:4317';
  var ROOT_ID = 'qa-agent-hub-pin-root';
  var STYLE_ID = 'qa-agent-hub-pin-style';

  var oldRoot = document.getElementById(ROOT_ID);
  if (oldRoot) oldRoot.remove();
  var oldStyle = document.getElementById(STYLE_ID);
  if (oldStyle) oldStyle.remove();

  var pageUrl = window.location.href.split('#')[0];
  var pinMode = true;

  var relayWindow = null;
  var relayIsReady = false;
  var relayPingTimer = null;
  var pendingRequests = {};
  var requestCounter = 0;

  window.addEventListener('message', function (event) {
    if (event.origin !== RELAY_ORIGIN) return;
    var data = event.data;
    if (!data) return;

    if (data.type === 'qa-pin-ready') {
      relayIsReady = true;
      if (relayPingTimer) { clearInterval(relayPingTimer); relayPingTimer = null; }
      return;
    }

    if (data.type === 'qa-pin-response') {
      var pending = pendingRequests[data.requestId];
      if (!pending) return;
      delete pendingRequests[data.requestId];
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    }
  });

  function ensureRelay() {
    if (!relayWindow || relayWindow.closed) {
      relayWindow = window.open(RELAY_URL, 'qaAgentHubRelay', 'width=360,height=220,left=80,top=80');
      relayIsReady = false;
    }
    if (!relayIsReady && !relayPingTimer) {
      relayPingTimer = setInterval(function () {
        if (relayIsReady) { clearInterval(relayPingTimer); relayPingTimer = null; return; }
        try { relayWindow.postMessage({ type: 'qa-pin-ping' }, RELAY_ORIGIN); } catch (e) {}
      }, 250);
      setTimeout(function () { if (relayPingTimer) { clearInterval(relayPingTimer); relayPingTimer = null; } }, 8000);
    }
    return relayWindow;
  }

  function relayRequest(action, payload) {
    ensureRelay();
    var requestId = 'r' + (++requestCounter) + '_' + Date.now();

    return new Promise(function (resolve, reject) {
      pendingRequests[requestId] = { resolve: resolve, reject: reject };
      var attempts = 0;
      var trySend = function () {
        attempts++;
        if (relayIsReady) {
          relayWindow.postMessage({ type: 'qa-pin-request', requestId: requestId, action: action, payload: payload }, RELAY_ORIGIN);
        } else if (attempts < 30) {
          setTimeout(trySend, 250);
        } else {
          delete pendingRequests[requestId];
          reject(new Error('QA Agent Hub helper tab did not respond. Keep the small helper tab open and try again.'));
        }
      };
      trySend();
    });
  }

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.qa-pin-banner{position:fixed;top:0;left:0;right:0;z-index:2147483000;' +
    'background:#1f2430;color:#fff;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;' +
    'font-size:13px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;}' +
    '.qa-pin-banner button{background:#2563eb;color:#fff;border:none;border-radius:4px;padding:5px 10px;font-size:12px;cursor:pointer;}' +
    '.qa-pin-marker{position:absolute;width:22px;height:22px;border-radius:50%;border:2px solid #fff;' +
    'box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:pointer;z-index:2147483000;display:flex;align-items:center;' +
    'justify-content:center;font-size:12px;color:#fff;font-weight:700;transform:translate(-50%,-50%);}' +
    '.qa-pin-popover{position:absolute;z-index:2147483001;background:#fff;color:#1f2430;border-radius:8px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.25);padding:14px;width:260px;' +
    'font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;}' +
    '.qa-pin-popover h4{margin:0 0 6px;font-size:14px;}' +
    '.qa-pin-popover label{display:block;font-size:11px;color:#6b7280;margin-top:8px;text-transform:uppercase;}' +
    '.qa-pin-popover input,.qa-pin-popover textarea,.qa-pin-popover select{width:100%;box-sizing:border-box;' +
    'padding:6px;margin-top:3px;border:1px solid #e2e5ea;border-radius:5px;font-size:13px;font-family:inherit;}' +
    '.qa-pin-popover .qa-pin-error{color:#dc2626;font-size:11px;margin-top:6px;}' +
    '.qa-pin-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}' +
    '.qa-pin-actions button{border:none;border-radius:5px;padding:6px 12px;font-size:12px;cursor:pointer;}' +
    '.qa-pin-btn-save{background:#2563eb;color:#fff;}' +
    '.qa-pin-btn-cancel{background:#e2e5ea;color:#1f2430;}' +
    '.qa-pin-btn-delete{background:#dc2626;color:#fff;}';
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = ROOT_ID;
  document.body.appendChild(root);

  var SEVERITY_COLORS = { low: '#6b7280', medium: '#d97706', high: '#dc2626', critical: '#991b1b' };
  var renderedPinIds = {};

  var banner = document.createElement('div');
  banner.className = 'qa-pin-banner';
  var bannerText = document.createElement('span');
  banner.appendChild(bannerText);
  var toggleBtn = document.createElement('button');
  banner.appendChild(toggleBtn);
  root.appendChild(banner);

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function closePopovers() {
    root.querySelectorAll('.qa-pin-popover').forEach(function (el) { el.remove(); });
  }

  function setPinMode(value) {
    pinMode = value;
    toggleBtn.textContent = value ? 'Exit pin mode' : 'Enable pin mode';
    bannerText.textContent = value
      ? 'QA Agent Hub — Review Pins: click anywhere on the page to drop a pin.'
      : 'QA Agent Hub — Review Pins (paused). Existing pins are still shown below.';
    if (!value) closePopovers();
  }

  function renderMarker(pin) {
    // The "load existing pins" call and a freshly saved pin can resolve out
    // of order and both try to render the same pin - keep only one marker.
    if (renderedPinIds[pin.id]) return;
    renderedPinIds[pin.id] = true;

    var marker = document.createElement('div');
    marker.className = 'qa-pin-marker';
    marker.style.background = SEVERITY_COLORS[pin.severity] || '#2563eb';
    marker.style.left = ((pin.x_percent / 100) * document.documentElement.scrollWidth) + 'px';
    marker.style.top = ((pin.y_percent / 100) * document.documentElement.scrollHeight) + 'px';
    marker.textContent = '!';
    marker.title = pin.name;
    marker.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closePopovers();
      showViewPopover(pin, marker);
    });
    root.appendChild(marker);
  }

  function showViewPopover(pin, marker) {
    var rect = marker.getBoundingClientRect();
    var pop = document.createElement('div');
    pop.className = 'qa-pin-popover';
    pop.style.left = (rect.left + window.scrollX + 26) + 'px';
    pop.style.top = (rect.top + window.scrollY) + 'px';
    pop.innerHTML =
      '<h4>' + escapeHtml(pin.name) + '</h4>' +
      '<div style="color:' + (SEVERITY_COLORS[pin.severity] || '#2563eb') + ';font-weight:700;text-transform:uppercase;font-size:11px;">' +
      escapeHtml(pin.severity) + '</div>' +
      '<p style="margin:8px 0 0;">' + escapeHtml(pin.description) + '</p>' +
      '<div class="qa-pin-actions">' +
      '<button class="qa-pin-btn-delete">Delete</button>' +
      '<button class="qa-pin-btn-cancel">Close</button>' +
      '</div>';
    root.appendChild(pop);

    pop.querySelector('.qa-pin-btn-cancel').addEventListener('click', function () { pop.remove(); });
    pop.querySelector('.qa-pin-btn-delete').addEventListener('click', function () {
      relayRequest('delete', { id: pin.id }).then(function () {
        marker.remove();
        pop.remove();
      });
    });
  }

  function showCreatePopover(clientX, clientY, xPercent, yPercent) {
    var pop = document.createElement('div');
    pop.className = 'qa-pin-popover';
    pop.style.left = (clientX + window.scrollX + 12) + 'px';
    pop.style.top = (clientY + window.scrollY) + 'px';
    pop.innerHTML =
      '<h4>New pin</h4>' +
      '<label>Name</label><input type="text" class="qa-pin-name" placeholder="Short label">' +
      '<label>Description</label><textarea class="qa-pin-desc" rows="3" placeholder="What did you notice?"></textarea>' +
      '<label>Severity</label>' +
      '<select class="qa-pin-severity">' +
      '<option value="low">Low</option>' +
      '<option value="medium" selected>Medium</option>' +
      '<option value="high">High</option>' +
      '<option value="critical">Critical</option>' +
      '</select>' +
      '<div class="qa-pin-actions">' +
      '<button class="qa-pin-btn-cancel">Cancel</button>' +
      '<button class="qa-pin-btn-save">Save pin</button>' +
      '</div>';
    root.appendChild(pop);

    pop.querySelector('.qa-pin-btn-cancel').addEventListener('click', function () { pop.remove(); });
    pop.querySelector('.qa-pin-btn-save').addEventListener('click', function () {
      var nameInput = pop.querySelector('.qa-pin-name');
      var name = nameInput.value.trim();
      var description = pop.querySelector('.qa-pin-desc').value.trim();
      var severity = pop.querySelector('.qa-pin-severity').value;
      if (!name) { nameInput.focus(); return; }

      var saveBtn = pop.querySelector('.qa-pin-btn-save');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      relayRequest('create', {
        page_url: pageUrl,
        x_percent: xPercent,
        y_percent: yPercent,
        name: name,
        description: description,
        severity: severity,
      })
        .then(function (pin) {
          renderMarker(pin);
          pop.remove();
        })
        .catch(function (err) {
          saveBtn.textContent = 'Save pin';
          saveBtn.disabled = false;
          var errEl = pop.querySelector('.qa-pin-error');
          if (!errEl) {
            errEl = document.createElement('div');
            errEl.className = 'qa-pin-error';
            pop.querySelector('.qa-pin-actions').before(errEl);
          }
          errEl.textContent = err.message;
        });
    });

    pop.querySelector('.qa-pin-name').focus();
  }

  function onDocumentClick(e) {
    if (!pinMode) return;
    if (e.target.closest('.qa-pin-popover') || e.target.closest('.qa-pin-banner') || e.target.closest('.qa-pin-marker')) return;

    e.preventDefault();
    e.stopPropagation();
    closePopovers();

    var docEl = document.documentElement;
    var xPercent = (e.pageX / docEl.scrollWidth) * 100;
    var yPercent = (e.pageY / docEl.scrollHeight) * 100;
    showCreatePopover(e.clientX, e.clientY, xPercent, yPercent);
  }

  toggleBtn.addEventListener('click', function () { setPinMode(!pinMode); });
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setPinMode(false);
  });

  setPinMode(true);

  relayRequest('list', { page_url: pageUrl })
    .then(function (pins) { pins.forEach(renderMarker); })
    .catch(function (err) {
      bannerText.textContent = 'QA Agent Hub — could not load existing pins: ' + err.message;
    });
})();
