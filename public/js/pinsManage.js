function pinCard(pin) {
  const div = document.createElement('div');
  div.className = 'issue-card';
  div.innerHTML = `
    <div class="issue-card-header">
      <span class="badge severity-${pin.severity}">${pin.severity}</span>
      <span class="issue-area">${new URL(pin.page_url).pathname || '/'}</span>
    </div>
    <h3>${pin.name}</h3>
    <p class="issue-desc">${pin.description || ''}</p>
    <div class="issue-meta">
      <span>${pin.page_url}</span>
      <span>Created: ${new Date(pin.created_at).toLocaleString()}</span>
    </div>
    <div class="issue-actions">
      <button class="btn-secondary delete-pin-btn">Delete</button>
    </div>
  `;

  div.querySelector('.delete-pin-btn').addEventListener('click', async () => {
    await fetch(`/api/pins/${pin.id}`, { method: 'DELETE' });
    loadPins();
  });

  return div;
}

async function loadPins() {
  const res = await fetch('/api/pins');
  const pins = await res.json();
  const list = document.getElementById('pins-list');
  list.innerHTML = '';

  if (!pins.length) {
    list.innerHTML = '<p class="muted">No pins saved yet. Try the bookmarklet above on a saucedemo.com page.</p>';
    return;
  }
  pins.forEach((pin) => list.appendChild(pinCard(pin)));
}

async function setupBookmarklet() {
  const code = await (await fetch('/bookmarklet.js')).text();
  document.getElementById('bookmarklet-link').href = 'javascript:' + code;
}

loadPins();
setupBookmarklet();
