// This page is same-origin with the server (localhost:4317), so it can call
// /api/pins directly with no CORS/Private-Network issues. It only exists to
// bridge those calls back to the bookmarklet running on saucedemo.com, which
// can't reach localhost directly.
const ALLOWED_ORIGIN = 'https://www.saucedemo.com';

async function handleRequest(action, payload) {
  if (action === 'list') {
    const res = await fetch(`/api/pins?page_url=${encodeURIComponent(payload.page_url)}`);
    return res.json();
  }
  if (action === 'create') {
    const res = await fetch('/api/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to save the pin');
    }
    return res.json();
  }
  if (action === 'delete') {
    await fetch(`/api/pins/${payload.id}`, { method: 'DELETE' });
    return { ok: true };
  }
  throw new Error(`Unknown action "${action}"`);
}

window.addEventListener('message', async (event) => {
  if (event.origin !== ALLOWED_ORIGIN) return;
  const data = event.data;
  if (!data) return;

  if (data.type === 'qa-pin-ping') {
    event.source.postMessage({ type: 'qa-pin-ready' }, event.origin);
    return;
  }

  if (data.type === 'qa-pin-request') {
    try {
      const result = await handleRequest(data.action, data.payload);
      event.source.postMessage({ type: 'qa-pin-response', requestId: data.requestId, result }, event.origin);
    } catch (err) {
      event.source.postMessage({ type: 'qa-pin-response', requestId: data.requestId, error: err.message }, event.origin);
    }
  }
});
