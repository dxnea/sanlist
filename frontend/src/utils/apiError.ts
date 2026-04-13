import { AxiosError } from 'axios';

export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    switch (error.response?.status) {
      case 404:
        return 'Не найдено';
      case 400:
        return 'Некорректные данные';
      case 401:
        return 'Необходима авторизация';
      case 403:
        return 'Доступ запрещён';
      case 500:
        return 'Ошибка сервера';
      default:
        return error.message || 'Ошибка сети';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Неизвестная ошибка';
}

export function isAxiosError(error: unknown): error is AxiosError {
  return error instanceof AxiosError;
}
