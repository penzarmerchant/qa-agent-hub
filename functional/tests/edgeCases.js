const { runSteps } = require('../stepRunner');
const { BASE_URL, login } = require('../../lib/browser');

async function attemptLogin(page, username, password) {
  await page.goto(BASE_URL);
  await page.fill('#user-name', username);
  await page.fill('#password', password);
  await page.click('#login-button');
  const errorLocator = page.locator('[data-test="error"]');
  await errorLocator.waitFor({ state: 'visible', timeout: 5000 });
  return (await errorLocator.innerText()).trim();
}

module.exports = {
  key: 'edge_cases',
  name: 'Login & Checkout Edge Cases',
  async run(page, { username, password }) {
    // These are independent scenarios (not one dependent journey), so a
    // failure in one shouldn't skip the rest - each is worth checking.
    const steps = [
      {
        name: 'Reject an incorrect password',
        fn: async () => {
          const message = await attemptLogin(page, username, 'not_the_real_password');
          if (!message) throw new Error('Expected an error message for an incorrect password');
        },
      },
      {
        name: 'Reject an empty username',
        fn: async () => {
          const message = await attemptLogin(page, '', password);
          if (!/username/i.test(message)) throw new Error(`Expected a "username is required" style error, got "${message}"`);
        },
      },
      {
        name: 'Reject an empty password',
        fn: async () => {
          const message = await attemptLogin(page, username, '');
          if (!/password/i.test(message)) throw new Error(`Expected a "password is required" style error, got "${message}"`);
        },
      },
    ];

    if (username === 'locked_out_user') {
      steps.push({
        name: 'Locked-out user sees a lockout message',
        fn: async () => {
          const message = await attemptLogin(page, username, password);
          if (!/locked out/i.test(message)) throw new Error(`Expected a lockout message, got "${message}"`);
        },
      });
      steps.push({
        name: 'Checkout blocks empty required fields',
        skip: 'Cannot reach checkout - this user is locked out',
      });
    } else {
      steps.push({
        name: 'Locked-out user sees a lockout message',
        skip: 'Only applicable to locked_out_user',
      });
      steps.push({
        name: 'Checkout blocks empty required fields',
        fn: async () => {
          const result = await login(page, username, password);
          if (!result.loggedIn) throw new Error(result.error || 'Login failed');
          await page.locator('.inventory_item').first().locator('button:has-text("Add to cart")').click();
          await page.click('.shopping_cart_link');
          await page.click('#checkout');
          await page.click('#continue');
          const errorLocator = page.locator('[data-test="error"]');
          await errorLocator.waitFor({ state: 'visible', timeout: 5000 });
          const message = (await errorLocator.innerText()).trim();
          if (!/first name/i.test(message)) throw new Error(`Expected a "First Name is required" error, got "${message}"`);
        },
      });
    }

    return runSteps(steps, { stopOnFailure: false });
  },
};
