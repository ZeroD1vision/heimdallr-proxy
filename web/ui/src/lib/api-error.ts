export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Универсальный парсер плохих ответов от сервера.
 * Умеет обрабатывать как структурированный JSON от Go, так и сырой текст (nginx-ошибки).
 */
export async function handleResponseError(res: Response): Promise<never> {
  let message = `HTTP Error ${res.status}`;
  let code: string | undefined;

  try {
    const body = await res.json();
    if (body && typeof body === 'object') {
      // Поддерживаем форматы { error: "..." } и { message: "...", code: "..." }
      message = body.error || body.message || message;
      code = body.code;
    }
  } catch {
    // Если на бэке упал nginx/сервер и вернул HTML-страницу
    try {
      const text = await res.text();
      if (text) {
        message = text.slice(0, 100); // Отрезаем кусок, чтобы не раздувать логи
      }
    } catch {}
  }

  throw new ApiError(res.status, message, code);
}