async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  const select = document.getElementById('user-select');
  select.innerHTML = users.map((u) => `<option value="${u}">${u}</option>`).join('');
}

async function runScrape() {
  const username = document.getElementById('user-select').value;
  const status = document.getElementById('status');
  const button = document.getElementById('run-btn');

  button.disabled = true;
  status.textContent = `Running scrape for ${username}...`;
  status.className = 'status-line running';

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Scrape failed');

    if (result.loggedIn === false) {
      status.textContent = `Could not log in as ${username}: ${result.error}`;
      status.className = 'status-line error';
    } else {
      status.textContent = `Done — ${result.issuesFound} issue(s) found for ${username}. See the Issues tab.`;
      status.className = 'status-line success';
    }
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    status.className = 'status-line error';
  } finally {
    button.disabled = false;
  }
}

document.getElementById('run-btn').addEventListener('click', runScrape);
loadUsers();
