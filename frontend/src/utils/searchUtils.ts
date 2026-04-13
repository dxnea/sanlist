export function normalizeSearchQuery(rawSearch: string): string {
  if (!rawSearch) return '';
  return rawSearch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[°@#$%^&*()_+=\[\]{};:'"\\|<>!~`]/g, '')
    .replace(/[-/\\_,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenizeSearch(rawSearch: string): string[] {
  const normalized = normalizeSearchQuery(rawSearch);
  return normalized.split(/\s+/).filter(word => word.length > 0);
}

export function matchesSearchTokens(text: string, tokens: string[]): boolean {
  const normalized = normalizeSearchQuery(text);
  return tokens.every(token => normalized.includes(token));
}
