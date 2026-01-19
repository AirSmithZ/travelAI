const DEFAULT_TIMEOUT_MS = 30_000;

export function getApiBase() {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
}

export async function request(path, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const mergedSignal = signal
    ? new AbortController()
    : null;

  // 简单合并 signal：任一 abort 都会触发
  if (mergedSignal) {
    const abort = () => mergedSignal.abort();
    signal.addEventListener('abort', abort, { once: true });
    controller.signal.addEventListener('abort', abort, { once: true });
  }

  try {
    const resp = await fetch(`${getApiBase()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: mergedSignal ? mergedSignal.signal : controller.signal,
    });

    const contentType = resp.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await resp.json() : await resp.text();

    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

