import { Locator, Page } from 'playwright';

class BasePage {
  readonly page: Page;
  readonly accountDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.accountDropdown = this.page.getByRole('button', { name: 'Account' });
  }

  async openAccountDropdown() {
    await this.accountDropdown.click();
  }

  async selectAccountOption(option: string) {
    await this.openAccountDropdown();
    await this.page.getByRole('menuitem', { name: option }).click();
  }

  async goto(path: string) {
    const defaultLanguage = 'en-GB';
    path = `${defaultLanguage}${path}`;
    await this.page.goto(path);
  }
}

export default BasePage;
