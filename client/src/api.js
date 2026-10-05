let csrfToken = '';
let tokenRequest;

export function setCsrfToken(token) {
  csrfToken = token || '';
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  if (method !== 'GET' && !csrfToken) {
    tokenRequest ||= fetch('/api/v1/auth/session', { credentials: 'include' })
      .then((response) => response.json())
      .then((result) => {
        csrfToken = result.data?.csrfToken || '';
      })
      .finally(() => {
        tokenRequest = undefined;
      });
    await tokenRequest;
  }
  const form = body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      result.error?.message || `Request failed (${response.status}). Please try again.`,
    );
    error.status = response.status;
    error.code = result.error?.code;
    throw error;
  }
  if (result.data?.csrfToken) setCsrfToken(result.data.csrfToken);
  return result.data;
}

export function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  return params.toString();
}

export function listItems(data) {
  return Array.isArray(data) ? data : data?.items || [];
}

export function uploadImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new Error('Choose a PNG, JPG, WebP, or GIF image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
  const form = new FormData();
  form.append('image', file);
  return api('/media', { method: 'POST', body: form });
}
