// Fixed hue order (never reassigned by frequency) so a given issue type
// always renders the same color run to run.
const ISSUE_TYPE_META = {
  broken_image: { label: 'Broken image', color: 'var(--series-1)' },
  missing_image: { label: 'Missing image', color: 'var(--series-2)' },
  zero_price: { label: 'Missing / zero price', color: 'var(--series-3)' },
  missing_title: { label: 'Missing title', color: 'var(--series-4)' },
  missing_description: { label: 'Missing description', color: 'var(--series-5)' },
  duplicate_image: { label: 'Duplicate image', color: 'var(--series-6)' },
  broken_link: { label: 'Broken link', color: 'var(--series-7)' },
  functional_failure: { label: 'Functional test failure', color: 'var(--series-8)' },
};
const OTHER_META = { label: 'Other', color: 'var(--series-other)' };

const STAT_TILES = [
  { key: 'total', label: 'Total issues', dotClass: null },
  { key: 'open', label: 'Open', dotClass: 'status-open' },
  { key: 'fixed', label: 'Fixed', dotClass: 'status-fixed' },
  { key: 'resolved', label: 'Resolved', dotClass: 'status-resolved' },
  { key: 'closed', label: 'Closed', dotClass: 'status-closed' },
];

function renderStatTiles(totals) {
  const container = document.getElementById('stat-tiles');
  container.innerHTML = STAT_TILES.map(
    (tile) => `
      <div class="stat-tile">
        <div class="stat-tile-label">
          ${tile.dotClass ? `<span class="badge-dot ${tile.dotClass}"></span>` : ''}
          ${tile.label}
        </div>
        <div class="stat-tile-value">${totals[tile.key]}</div>
      </div>
    `
  ).join('');
}

function metaFor(issueType) {
  return ISSUE_TYPE_META[issueType] || OTHER_META;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function donutSlicePath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function renderEmptyDonut(svg) {
  svg.innerHTML = `
    <circle cx="120" cy="120" r="100" fill="none" stroke="var(--border)" stroke-width="40" />
    <text x="120" y="116" text-anchor="middle" class="donut-hero">0</text>
    <text x="120" y="138" text-anchor="middle" class="donut-hero-label">issues</text>
  `;
}

function renderDonut(byType, scopedTotal) {
  const svg = document.getElementById('donut-chart');
  svg.innerHTML = '';

  if (!scopedTotal) {
    renderEmptyDonut(svg);
    return;
  }

  const cx = 120;
  const cy = 120;
  const outerR = 100;
  const innerR = 60;
  const gapDeg = 1.5;

  let angle = 0;
  byType.forEach(({ issue_type, count }) => {
    const meta = metaFor(issue_type);
    const sliceDeg = (count / scopedTotal) * 360;
    const pad = Math.min(gapDeg, sliceDeg * 0.15);
    const start = angle + pad;
    const end = angle + sliceDeg - pad;

    if (end > start) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', donutSlicePath(cx, cy, outerR, innerR, start, end));
      path.setAttribute('fill', meta.color);
      svg.appendChild(path);

      // Direct label for slices big enough to hold text comfortably.
      const percent = Math.round((count / scopedTotal) * 100);
      if (percent >= 8) {
        const midAngle = (start + end) / 2;
        const labelPos = polarToCartesian(cx, cy, (outerR + innerR) / 2, midAngle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelPos.x);
        text.setAttribute('y', labelPos.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('class', 'donut-slice-label');
        text.textContent = `${percent}%`;
        svg.appendChild(text);
      }
    }

    angle += sliceDeg;
  });

  const hero = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  hero.setAttribute('x', 120);
  hero.setAttribute('y', 116);
  hero.setAttribute('text-anchor', 'middle');
  hero.setAttribute('class', 'donut-hero');
  hero.textContent = String(scopedTotal);
  svg.appendChild(hero);

  const heroLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  heroLabel.setAttribute('x', 120);
  heroLabel.setAttribute('y', 138);
  heroLabel.setAttribute('text-anchor', 'middle');
  heroLabel.setAttribute('class', 'donut-hero-label');
  heroLabel.textContent = 'issues';
  svg.appendChild(heroLabel);
}

function renderLegend(byType, scopedTotal) {
  const container = document.getElementById('legend-list');

  if (!byType.length) {
    container.innerHTML = '<p class="muted">No issues match this filter.</p>';
    return;
  }

  container.innerHTML = byType
    .slice()
    .sort((a, b) => b.count - a.count)
    .map(({ issue_type, count }) => {
      const meta = metaFor(issue_type);
      const percent = scopedTotal ? Math.round((count / scopedTotal) * 100) : 0;
      return `
        <div class="legend-row">
          <span class="legend-swatch" style="background:${meta.color}"></span>
          <span class="legend-label">${meta.label}</span>
          <span class="legend-value">${count} (${percent}%)</span>
        </div>
      `;
    })
    .join('');
}

async function loadDashboard() {
  const status = document.getElementById('status-filter').value;
  const url = status ? `/api/dashboard/summary?status=${encodeURIComponent(status)}` : '/api/dashboard/summary';
  const res = await fetch(url);
  const data = await res.json();

  renderStatTiles(data.totals);
  renderDonut(data.byType, data.scopedTotal);
  renderLegend(data.byType, data.scopedTotal);
}

document.getElementById('status-filter').addEventListener('change', loadDashboard);
loadDashboard();
