function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function requestJson(input, init) {
  const response = await fetch(input, init);
  const text = await response.text();
  const data = parseJsonSafely(text);

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed with status ${response.status}`);
  }

  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}
