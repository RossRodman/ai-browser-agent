import type { BrowserContext, Route } from 'playwright';
import type { RunMode } from '../domain';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const ALWAYS_ALLOWED = ['/login'];

export class WriteGate {
  readonly blocked: string[] = [];
  private openPath: string | undefined;

  constructor(private readonly mode: RunMode) {}

  async attach(context: BrowserContext): Promise<void> {
    await context.route('**/*', (route) => this.handle(route));
  }

  async withWriteAccess<T>(urlPath: string, fn: () => Promise<T>): Promise<T> {
    if (this.mode !== 'write') throw new Error(`Write access is not allowed in ${this.mode} mode`);
    this.openPath = urlPath;
    try {
      return await fn();
    } finally {
      this.openPath = undefined;
    }
  }

  isAllowed(method: string, url: string): boolean {
    const path = new URL(url).pathname;
    return (
      SAFE_METHODS.includes(method.toUpperCase()) ||
      ALWAYS_ALLOWED.includes(path) ||
      (this.mode === 'write' && path === this.openPath)
    );
  }

  private async handle(route: Route): Promise<void> {
    const { method, url } = { method: route.request().method(), url: route.request().url() };
    if (this.isAllowed(method, url)) return route.continue();
    this.blocked.push(`${method} ${url}`);
    console.warn(`[gate] blocked ${method} ${url}`);
    await route.abort('blockedbyclient');
  }
}
