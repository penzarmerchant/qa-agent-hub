const crypto = require('node:crypto');
const { launchBrowser, login, BASE_URL } = require('../lib/browser');
const { upsertIssue } = require('../db/connection');

const SEVERITY = {
  missing_title: 'high',
  missing_image: 'high',
  broken_image: 'high',
  zero_price: 'high',
  missing_description: 'medium',
  duplicate_image: 'medium',
  broken_link: 'low',
};

const PLP_SELECTORS = {
  name: '.inventory_item_name',
  desc: '.inventory_item_desc',
  price: '.inventory_item_price',
};

const PDP_SELECTORS = {
  name: '.inventory_details_name',
  desc: '.inventory_details_desc',
  price: '.inventory_details_price',
};

const LINKS_TO_CHECK = [
  { selector: '#about_sidebar_link', label: 'About (menu)' },
  { selector: '.social_twitter a', label: 'Twitter (footer)' },
  { selector: '.social_facebook a', label: 'Facebook (footer)' },
  { selector: '.social_linkedin a', label: 'LinkedIn (footer)' },
];

function makeRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function issueRow({ runId, area, user, name, url, issueType, title, description }) {
  return {
    run_id: runId,
    source: 'content_scrape',
    area,
    product_name: name || null,
    user,
    issue_type: issueType,
    title,
    description: description || '',
    severity: SEVERITY[issueType] || 'medium',
    url: url || null,
  };
}

async function readProductCard(container, selectors) {
  const nameEl = container.locator(selectors.name).first();
  const descEl = container.locator(selectors.desc).first();
  const priceEl = container.locator(selectors.price).first();
  const imgEl = container.locator('img').first();

  // A click-based SPA navigation can briefly leave the DOM mid-render;
  // wait for the title to attach before treating it as genuinely missing.
  await nameEl.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

  const name = (await nameEl.count()) ? (await nameEl.innerText()).trim() : '';
  const description = (await descEl.count()) ? (await descEl.innerText()).trim() : '';
  const priceText = (await priceEl.count()) ? (await priceEl.innerText()).trim() : '';
  const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));

  const hasImg = await imgEl.count();
  const src = hasImg ? await imgEl.getAttribute('src') : null;
  const naturalWidth = hasImg ? await imgEl.evaluate((img) => img.naturalWidth).catch(() => 0) : 0;

  return { name, description, priceText, price, src, naturalWidth };
}

async function hashImage(page, src) {
  if (!src) return null;
  try {
    const absoluteUrl = new URL(src, page.url()).toString();
    const response = await page.request.get(absoluteUrl);
    const body = await response.body();
    return crypto.createHash('sha256').update(body).digest('hex');
  } catch {
    return null;
  }
}

function checkCard(card, { runId, area, user, url }, issues) {
  const { name, description, priceText, price, src, naturalWidth } = card;
  const label = name || '(unknown product)';

  if (!name) {
    issues.push(
      issueRow({ runId, area, user, name, url, issueType: 'missing_title', title: `Missing product title on ${area}`, description: `A product card on ${area} has no title text.` })
    );
  }
  if (!src) {
    issues.push(
      issueRow({ runId, area, user, name, url, issueType: 'missing_image', title: `Missing image for "${label}"`, description: `No image was found for this product on ${area}.` })
    );
  } else if (!naturalWidth) {
    issues.push(
      issueRow({ runId, area, user, name, url, issueType: 'broken_image', title: `Broken image for "${label}"`, description: `Image failed to load (src: ${src}) for this product on ${area}.` })
    );
  }
  if (!priceText || Number.isNaN(price) || price <= 0) {
    issues.push(
      issueRow({ runId, area, user, name, url, issueType: 'zero_price', title: `Missing or zero price for "${label}"`, description: `Price text was "${priceText || '(empty)'}" on ${area}.` })
    );
  }
  if (!description) {
    issues.push(
      issueRow({ runId, area, user, name, url, issueType: 'missing_description', title: `Missing description for "${label}"`, description: `No description text was found for this product on ${area}.` })
    );
  }
}

async function checkLinks(page, { runId, user }, issues) {
  for (const { selector, label } of LINKS_TO_CHECK) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) continue;
    const href = await locator.getAttribute('href');
    if (!href || href === '#' || !/^https?:\/\//.test(href)) {
      issues.push(
        issueRow({
          runId,
          area: 'Navigation',
          user,
          name: label,
          url: page.url(),
          issueType: 'broken_link',
          title: `Broken or missing link: ${label}`,
          description: `Expected a real destination URL, got "${href || '(empty)'}".`,
        })
      );
    }
  }
}

function recordDuplicateImages(imageHashes, runId, user, issues) {
  for (const occurrences of imageHashes.values()) {
    const uniqueProducts = [...new Set(occurrences.map((o) => o.name))];
    if (uniqueProducts.length > 1) {
      for (const { name, area, url } of occurrences) {
        issues.push(
          issueRow({
            runId,
            area,
            user,
            name,
            url,
            issueType: 'duplicate_image',
            title: `Image reused across multiple products (includes "${name}")`,
            description: `The same image file is used for: ${uniqueProducts.join(', ')}.`,
          })
        );
      }
    }
  }
}

async function runScrape(username, password) {
  const runId = makeRunId();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const issues = [];
  const imageHashes = new Map();

  try {
    const loginResult = await login(page, username, password);
    if (!loginResult.loggedIn) {
      return { runId, user: username, loggedIn: false, error: loginResult.error, issuesFound: 0 };
    }

    await checkLinks(page, { runId, user: username }, issues);

    const plpCards = page.locator('.inventory_item');
    const productCount = await plpCards.count();

    for (let i = 0; i < productCount; i++) {
      const card = await readProductCard(plpCards.nth(i), PLP_SELECTORS);
      checkCard(card, { runId, area: 'PLP', user: username, url: page.url() }, issues);
      if (card.src && card.naturalWidth) {
        const hash = await hashImage(page, card.src);
        if (hash) {
          if (!imageHashes.has(hash)) imageHashes.set(hash, []);
          imageHashes.get(hash).push({ name: card.name, area: 'PLP', url: page.url() });
        }
      }
    }

    for (let i = 0; i < productCount; i++) {
      await page.goto(`${BASE_URL}inventory.html`);
      await page.locator('.inventory_item_name').nth(i).click();
      const container = page.locator('.inventory_details');
      const card = await readProductCard(container, PDP_SELECTORS);
      checkCard(card, { runId, area: 'PDP', user: username, url: page.url() }, issues);
      if (card.src && card.naturalWidth) {
        const hash = await hashImage(page, card.src);
        if (hash) {
          if (!imageHashes.has(hash)) imageHashes.set(hash, []);
          imageHashes.get(hash).push({ name: card.name, area: 'PDP', url: page.url() });
        }
      }
    }

    recordDuplicateImages(imageHashes, runId, username, issues);

    for (const issue of issues) upsertIssue(issue);

    return { runId, user: username, loggedIn: true, error: null, issuesFound: issues.length };
  } finally {
    await browser.close();
  }
}

module.exports = { runScrape };
