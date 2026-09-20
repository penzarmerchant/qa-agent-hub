const STATUS_OPTIONS = ['open', 'fixed', 'resolved', 'closed'];

function formatForJira(issue) {
  return [
    `Title: ${issue.title}`,
    `Area: ${issue.area}`,
    `Product: ${issue.product_name || '-'}`,
    `User tested: ${issue.user || '-'}`,
    `Severity: ${issue.severity}`,
    `Status: ${issue.status}`,
    `First seen: ${issue.first_seen}`,
    `Last seen: ${issue.last_seen}`,
    `URL: ${issue.url || '-'}`,
    '',
    'Description:',
    issue.description || '-',
  ].join('\n');
}

function issueCard(issue) {
  const div = document.createElement('div');
  div.className = 'issue-card';
  div.innerHTML = `
    <div class="issue-card-header">
      <span class="badge severity-${issue.severity}">${issue.severity}</span>
      <span class="badge status-${issue.status}">${issue.status}</span>
      <span class="issue-area">${issue.area}</span>
    </div>
    <h3>${issue.title}</h3>
    <p class="issue-desc">${issue.description || ''}</p>
    <div class="issue-meta">
      <span>First seen: ${new Date(issue.first_seen).toLocaleString()}</span>
      <span>Last seen: ${new Date(issue.last_seen).toLocaleString()}</span>
    </div>
    <div class="issue-actions">
      <select class="status-select">
        ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === issue.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <button class="btn-secondary export-issue-btn">Export</button>
    </div>
  `;

  div.querySelector('.status-select').addEventListener('change', async (e) => {
    await fetch(`/api/issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: e.target.value }),
    });
    loadIssues();
  });

  div.querySelector('.export-issue-btn').addEventListener('click', () => {
    document.getElementById('export-text').value = formatForJira(issue);
    document.getElementById('export-modal').classList.remove('hidden');
  });

  return div;
}

async function loadIssues() {
  const status = document.getElementById('status-filter').value;
  const url = status ? `/api/issues?status=${encodeURIComponent(status)}` : '/api/issues';
  const res = await fetch(url);
  const issues = await res.json();

  const list = document.getElementById('issue-list');
  list.innerHTML = '';
  if (!issues.length) {
    list.innerHTML = '<p class="muted">No issues found.</p>';
    return;
  }
  issues.forEach((issue) => list.appendChild(issueCard(issue)));
}

document.getElementById('status-filter').addEventListener('change', loadIssues);
document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('export-modal').classList.add('hidden');
});
document.getElementById('copy-btn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(document.getElementById('export-text').value);
});

loadIssues();
