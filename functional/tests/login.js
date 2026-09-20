const { runSteps } = require('../stepRunner');
const { BASE_URL } = require('../../lib/browser');

module.exports = {
  key: 'login',
  name: 'Login',
  async run(page, { username, password }) {
    return runSteps([
      {
        name: 'Open the saucedemo login page',
        fn: async () => {
          await page.goto(BASE_URL);
          await page.locator('#user-name').waitFor({ state: 'visible' });
        },
      },
      {
        name: 'Log in with valid credentials',
        fn: async () => {
          await page.fill('#user-name', username);
          await page.fill('#password', password);
          await page.click('#login-button');
        },
      },
      {
        name: 'Land on the inventory page',
        fn: async () => {
          await page.waitForURL('**/inventory.html', { timeout: 8000 });
          await page.locator('.inventory_list').waitFor({ state: 'visible' });
        },
      },
      {
        name: 'Log out successfully',
        fn: async () => {
          await page.click('#react-burger-menu-btn');
          await page.click('#logout_sidebar_link');
          await page.locator('#login-button').waitFor({ state: 'visible' });
        },
      },
    ]);
  },
};
