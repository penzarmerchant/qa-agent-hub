const ALL_USERS_VALUE = '__all__';
let allUsernames = [];

async function loadTestCheckboxes() {
  const res = await fetch('/api/functional/tests');
  const suites = await res.json();
  const container = document.getElementById('test-checkboxes');
  container.innerHTML = suites
    .map(
      (s) => `
        <label class="checkbox-item">
          <input type="checkbox" value="${s.key}" checked>
          ${s.name}
        </label>
      `
    )
    .join('');
}

async function loadUserOptions() {
  const res = await fetch('/api/users');
  allUsernames = await res.json();
  const select = document.getElementById('user-select');
  select.innerHTML =
    `<option value="${ALL_USERS_VALUE}">All users</option>` +
    allUsernames.map((u) => `<option value="${u}">${u}</option>`).join('');
}

function stepBadge(step) {
  return `<span class="badge step-${step.status}">${step.status}</span>`;
}

function testRunCard(run) {
  const div = document.createElement('div');
  div.className = 'issue-card';
  const stepsHtml = run.steps
    .map(
      (step) => `
        <div class="step-row">
          ${stepBadge(step)}
          <span class="step-name">${step.step_order}. ${step.step_name}</span>
          ${step.error ? `<span class="step-error">${step.error}</span>` : ''}
        </div>
      `
    )
    .join('');

  div.innerHTML = `
    <div class="issue-card-header">
      <span class="badge status-${run.status === 'pass' ? 'fixed' : 'open'}">${run.status}</span>
      <span class="issue-area">${run.user}</span>
    </div>
    <h3>${run.test_name}</h3>
    <div class="step-list">${stepsHtml}</div>
  `;
  return div;
}

async function loadResults() {
  const res = await fetch('/api/functional/runs');
  const runs = await res.json();
  const list = document.getElementById('results-list');
  list.innerHTML = '';

  if (!runs.length) {
    list.innerHTML = '<p class="muted">No functional tests have been run yet.</p>';
    return;
  }

  const groups = new Map();
  runs.forEach((run) => {
    if (!groups.has(run.run_group_id)) groups.set(run.run_group_id, []);
    groups.get(run.run_group_id).push(run);
  });

  for (const [, groupRuns] of groups) {
    const passCount = groupRuns.filter((r) => r.status === 'pass').length;
    const failCount = groupRuns.length - passCount;
    const header = document.createElement('div');
    header.className = 'run-group-header';
    header.textContent = `${new Date(groupRuns[0].started_at).toLocaleString()} — ${passCount} passed, ${failCount} failed`;
    list.appendChild(header);
    groupRuns.forEach((run) => list.appendChild(testRunCard(run)));
  }
}

async function runTests() {
  const testKeys = Array.from(document.querySelectorAll('#test-checkboxes input:checked')).map((el) => el.value);
  const selectedUser = document.getElementById('user-select').value;
  const usernames = selectedUser === ALL_USERS_VALUE ? allUsernames : [selectedUser];

  const status = document.getElementById('status');
  const button = document.getElementById('run-btn');

  if (!testKeys.length) {
    status.textContent = 'Pick at least one test.';
    status.className = 'status-line error';
    return;
  }

  button.disabled = true;
  status.textContent = `Running ${testKeys.length} test(s) for ${usernames.length} user(s)... this can take a minute.`;
  status.className = 'status-line running';

  try {
    const res = await fetch('/api/functional/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testKeys, usernames }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Run failed');

    const passCount = result.summaries.filter((s) => s.status === 'pass').length;
    const failCount = result.summaries.length - passCount;
    status.textContent = `Done — ${passCount} passed, ${failCount} failed.`;
    status.className = failCount ? 'status-line error' : 'status-line success';
    await loadResults();
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    status.className = 'status-line error';
  } finally {
    button.disabled = false;
  }
}

document.getElementById('run-btn').addEventListener('click', runTests);
loadTestCheckboxes();
loadUserOptions();
loadResults();
