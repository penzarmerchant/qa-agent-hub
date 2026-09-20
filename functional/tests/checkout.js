const { runSteps } = require('../stepRunner');
const { login } = require('../../lib/browser');

module.exports = {
  key: 'checkout',
  name: 'Checkout Journey',
  async run(page, { username, password }) {
    return runSteps([
      {
        name: 'Log in',
        fn: async () => {
          const result = await login(page, username, password);
          if (!result.loggedIn) throw new Error(result.error || 'Login failed');
        },
      },
      {
        name: 'Add a product to the cart',
        fn: async () => {
          await page.locator('.inventory_item').first().locator('button:has-text("Add to cart")').click();
        },
      },
      {
        name: 'Go to the cart',
        fn: async () => {
          await page.click('.shopping_cart_link');
          await page.locator('.cart_item').first().waitFor({ state: 'visible' });
        },
      },
      {
        name: 'Start checkout',
        fn: async () => {
          await page.click('#checkout');
          await page.locator('#first-name').waitFor({ state: 'visible' });
        },
      },
      {
        name: 'Fill in shipping details',
        fn: async () => {
          await page.fill('#first-name', 'QA');
          await page.fill('#last-name', 'Agent');
          await page.fill('#postal-code', '2000');
          await page.click('#continue');
        },
      },
      {
        name: 'Review the order overview',
        fn: async () => {
          await page.locator('.summary_total_label').waitFor({ state: 'visible', timeout: 5000 });
          const itemCount = await page.locator('.cart_item').count();
          if (itemCount !== 1) throw new Error(`Expected 1 item in the order summary, found ${itemCount}`);
        },
      },
      {
        name: 'Finish the order',
        fn: async () => {
          await page.click('#finish');
          await page.locator('.complete-header').waitFor({ state: 'visible', timeout: 5000 });
        },
      },
      {
        name: 'Order confirmation is shown',
        fn: async () => {
          const text = (await page.locator('.complete-header').innerText()).trim();
          if (!/thank you/i.test(text)) throw new Error(`Expected a thank-you message, got "${text}"`);
        },
      },
    ]);
  },
};
