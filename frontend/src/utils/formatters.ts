export function formatPrice(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatQuantity(value: number): string {
  const fixed = value.toFixed(3);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function parsePositiveNumber(value: string, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

export function getImageUrl(imageUrl: string | null): string {
  if (!imageUrl) {
    return '/placeholders/tools.svg';
  }
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  return `/uploads/${imageUrl}`;
}

export function getUnitStep(unit: string): number {
  if (unit === 'кг' || unit === 'м' || unit === 'л') {
    return 0.1;
  }
  if (unit === 'г' || unit === 'мм') {
    return 1;
  }
  return 1;
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true;
  }
  if (target.closest('button')) {
    return true;
  }
  return false;
}
