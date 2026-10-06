/** Bound authentication requests, including the response body, on mobile networks. */
export async function fetchAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const previous = init.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort();
  if (previous?.aborted) abort();
  previous?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (error) {
    if (timedOut) throw new Error('La conexión tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.');
    throw error;
  } finally {
    clearTimeout(timer);
    previous?.removeEventListener('abort', abort);
  }
}
