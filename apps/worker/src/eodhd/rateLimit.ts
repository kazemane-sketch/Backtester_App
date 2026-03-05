export class EodhdRateLimiter {
  private nextAllowedAt = 0;

  constructor(private readonly minIntervalMs = 250) {}

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAt - now);

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.nextAllowedAt = Date.now() + this.minIntervalMs;
    return task();
  }
}
