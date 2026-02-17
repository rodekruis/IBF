import { Locator, Page } from 'playwright';
import { PrimeNGDropdown } from '@ibf-e2e/portal/components/PrimeNGDropdown';

class BasePage {
  readonly page: Page;
  readonly localeDropdown: PrimeNGDropdown;
  readonly sidebarToggle: Locator;
  readonly accountDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.localeDropdown = new PrimeNGDropdown({
      page,
      testId: 'locale-dropdown',
    });
    this.sidebarToggle = this.page.getByTestId('sidebar-toggle');
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

  async changeLanguage(language: string) {
    await this.openSidebar();
    await this.localeDropdown.selectOption({ label: language });
  }

  async openSidebar() {
    await this.sidebarToggle.click();
  }
}

export default BasePage;
