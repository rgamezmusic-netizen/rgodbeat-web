type WakeLockEnvironment = {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  navigator: Pick<Navigator, 'wakeLock'>;
};

/** Keep a visible Studio session awake, including recording and YouTube upload. */
export function maintainScreenWakeLock(environment: WakeLockEnvironment): () => void {
  const { document, window, navigator } = environment;
  if (!navigator.wakeLock?.request) return () => {};
  let stopped = false;
  let pending = false;
  let sentinel: WakeLockSentinel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retriedRelease = false;
  const visible = () => document.visibilityState === 'visible';

  const request = async () => {
    if (stopped || pending || !visible() || (sentinel && !sentinel.released)) return;
    pending = true;
    try {
      const acquired = await navigator.wakeLock.request('screen');
      if (stopped || !visible()) {
        await acquired.release();
        return;
      }
      sentinel = acquired;
      acquired.addEventListener('release', () => {
        if (sentinel !== acquired) return;
        sentinel = null;
        // One retry per release cycle; do not loop against a low-power policy.
        if (!stopped && visible() && !retriedRelease) {
          retriedRelease = true;
          retryTimer = setTimeout(() => { retryTimer = undefined; void request(); }, 1000);
        }
      }, { once: true });
    } catch {
      // The system may deny this in low-power mode. A later gesture, foreground
      // return or page restore retries without interrupting audio or uploads.
    } finally { pending = false; }
  };
  const retry = () => {
    retriedRelease = false;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    void request();
  };
  const visibilityChanged = () => {
    if (visible()) { retry(); return; }
    clearTimeout(retryTimer);
    retryTimer = undefined;
    const current = sentinel;
    sentinel = null;
    void current?.release().catch(() => {});
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  document.addEventListener('pointerdown', retry);
  document.addEventListener('keydown', retry);
  window.addEventListener('pageshow', retry);
  window.addEventListener('focus', retry);
  void request();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    document.removeEventListener('visibilitychange', visibilityChanged);
    document.removeEventListener('pointerdown', retry);
    document.removeEventListener('keydown', retry);
    window.removeEventListener('pageshow', retry);
    window.removeEventListener('focus', retry);
    const current = sentinel;
    sentinel = null;
    void current?.release().catch(() => {});
  };
}
