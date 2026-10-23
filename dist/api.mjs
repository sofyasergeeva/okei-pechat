export function createApiClient() {
  let generation = 0;
  async function request(path, { method = 'GET', body, blob = false } = {}) {
    const operation = generation;
    const multipart = body instanceof FormData;
    const response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {},
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
    const data = blob && response.ok ? await response.blob() : await response.json();
    if (operation !== generation) throw Error('Сессия изменилась. Операция отменена.');
    if (!response.ok)
      throw Object.assign(Error(data.error || 'Ошибка запроса.'), { status: response.status });
    return data;
  }
  return {
    request,
    invalidate() {
      generation++;
    },
  };
}
export async function openServerPDF(api, path) {
  const tab = window.open('about:blank', '_blank');
  try {
    const blob = await api.request(path, { blob: true });
    if (!tab) throw Error('Разреши открытие PDF в новой вкладке.');
    const url = URL.createObjectURL(blob);
    tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
