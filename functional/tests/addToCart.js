const { runSteps } = require('../stepRunner');
const { login } = require('../../lib/browser');

module.exports = {
  key: 'add_to_cart',
  name: 'Add to Cart',
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
        name: 'Add the first product to the cart',
        fn: async () => {
          await page.locator('.inventory_item').first().locator('button:has-text("Add to cart")').click();
        },
      },
      {
        name: 'Cart badge shows 1 item',
        fn: async () => {
          const badge = page.locator('.shopping_cart_badge');
          await badge.waitFor({ state: 'visible', timeout: 5000 });
          const text = (await badge.innerText()).trim();
          if (text !== '1') throw new Error(`Expected cart badge "1", got "${text}"`);
        },
      },
      {
        name: 'Cart page shows the item',
        fn: async () => {
          await page.click('.shopping_cart_link');
          await page.locator('.cart_item').first().waitFor({ state: 'visible' });
          const count = await page.locator('.cart_item').count();
          if (count !== 1) throw new Error(`Expected 1 item in the cart, found ${count}`);
        },
      },
      {
        name: 'Remove the item from the cart',
        fn: async () => {
          await page.locator('.cart_item').first().locator('button:has-text("Remove")').click();
          await page.locator('.cart_item').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
          const count = await page.locator('.cart_item').count();
          if (count !== 0) throw new Error(`Expected the cart to be empty, found ${count} item(s)`);
        },
      },
    ]);
  },
};
