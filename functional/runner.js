const { launchBrowser, BASE_URL } = require('../lib/browser');
const { findUser } = require('../lib/users');
const { recordTestRun, upsertIssue } = require('../db/connection');

const SUITES = {
  login: require('./tests/login'),
  add_to_cart: require('./tests/addToCart'),
  checkout: require('./tests/checkout'),
  edge_cases: require('./tests/edgeCases'),
};

function listSuites() {
  return Object.values(SUITES).map((s) => ({ key: s.key, name: s.name }));
}

function makeRunGroupId() {
  return `funrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function runOneSuite(suite, user, runGroupId) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const startedAt = new Date().toISOString();
  let steps;

  try {
    steps = await suite.run(page, { username: user.username, password: user.password });
  } finally {
    await browser.close();
  }

  const finishedAt = new Date().toISOString();
  const overallStatus = steps.some((s) => s.status === 'fail') ? 'fail' : 'pass';

  const testRunId = recordTestRun({
    runGroupId,
    testKey: suite.key,
    testName: suite.name,
    user: user.username,
    status: overallStatus,
    startedAt,
    finishedAt,
    steps,
  });

  if (overallStatus === 'fail') {
    const failedStep = steps.find((s) => s.status === 'fail');
    upsertIssue({
      run_id: runGroupId,
      source: 'functional_test',
      area: suite.name,
      product_name: null,
      user: user.username,
      issue_type: 'functional_failure',
      title: `${suite.name} failed for ${user.username} at step "${failedStep.name}"`,
      description: failedStep.error || '',
      severity: 'high',
      url: BASE_URL,
    });
  }

  return { testRunId, testKey: suite.key, testName: suite.name, user: user.username, status: overallStatus };
}

async function runFunctionalTests({ testKeys, usernames }) {
  const runGroupId = makeRunGroupId();
  const summaries = [];

  for (const username of usernames) {
    const user = findUser(username);
    if (!user) continue;

    for (const testKey of testKeys) {
      const suite = SUITES[testKey];
      if (!suite) continue;
      const summary = await runOneSuite(suite, user, runGroupId);
      summaries.push(summary);
    }
  }

  return { runGroupId, summaries };
}

module.exports = { runFunctionalTests, listSuites };
