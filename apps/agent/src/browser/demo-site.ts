import type { Page } from 'playwright';
import { RawRecord, type EditableField } from '../domain';
import { AuthError } from '../core/errors';

export const recordPath = (recordId: string) => `/records/${recordId}`;

export class DemoSite {
  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {}

  private async open(path: string): Promise<void> {
    const res = await this.page.goto(this.baseUrl + path);
    if (!res?.ok()) throw new Error(`${path} returned ${res?.status()}`);
  }

  async login(username: string, password: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}/login`);
    await this.page.getByTestId('username').fill(username);
    await this.page.getByTestId('password').fill(password);
    await this.page.getByTestId('login-submit').click();
    await this.page.waitForLoadState('domcontentloaded');
    if (new URL(this.page.url()).pathname === '/login') throw new AuthError('Invalid credentials');
  }

  async readPage(n: number): Promise<{ rows: RawRecord[]; pages: number }> {
    await this.open(`/records?page=${n}`);
    const pages = Number(await this.page.getByTestId('pager').getAttribute('data-pages'));
    const cells = await this.page
      .getByTestId('record-row')
      .evaluateAll((rows) =>
        rows.map((row) =>
          Array.from(row.querySelectorAll('[data-col]')).map((td) => [
            td.getAttribute('data-col') ?? '',
            td.textContent ?? '',
          ]),
        ),
      );
    const rows = cells.map((c) => RawRecord.parse(Object.fromEntries(c)));
    return { rows, pages };
  }

  async readField(recordId: string, field: EditableField): Promise<string> {
    await this.open(`${recordPath(recordId)}/edit`);
    return this.page.getByTestId(`field-${field}`).inputValue();
  }

  async updateField(recordId: string, field: EditableField, value: string): Promise<void> {
    await this.open(`${recordPath(recordId)}/edit`);
    await this.page.getByTestId(`field-${field}`).fill(value);
    await Promise.all([
      this.page.waitForURL(/\/records(\?.*)?$/),
      this.page.getByTestId('save').click(),
    ]);
  }
}
