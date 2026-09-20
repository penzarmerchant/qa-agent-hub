// Runs a list of { name, fn } steps in order, recording pass/fail per step.
// By default, once a step fails the remaining steps are marked "skipped"
// (they depend on state the failed step never reached). Pass
// { stopOnFailure: false } for suites made of independent scenarios.
async function runSteps(steps, { stopOnFailure = true } = {}) {
  const results = [];
  let blocked = false;

  for (const step of steps) {
    if (step.skip) {
      results.push({ name: step.name, status: 'skipped', error: step.skip, duration_ms: 0 });
      continue;
    }
    if (blocked) {
      results.push({ name: step.name, status: 'skipped', error: 'Skipped after an earlier step failed', duration_ms: 0 });
      continue;
    }

    const start = Date.now();
    try {
      await step.fn();
      results.push({ name: step.name, status: 'pass', error: null, duration_ms: Date.now() - start });
    } catch (err) {
      results.push({ name: step.name, status: 'fail', error: err.message, duration_ms: Date.now() - start });
      if (stopOnFailure) blocked = true;
    }
  }

  return results;
}

module.exports = { runSteps };
