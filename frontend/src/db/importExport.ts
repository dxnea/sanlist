/**
 * Импорт данных из JSON-файла (экспортированного из бэкенда) в IndexedDB.
 * 
 * Использование:
 *   import { importPwaExport } from './db/importExport';
 *   const file = ...; // File из input
 *   const result = await importPwaExport(file);
 */

import { db } from './database';

export interface ImportResult {
  categories: number;
  products: number;
  lists: number;
  listItems: number;
  favorites: number;
}

export interface PwaExportData {
  version: number;
  exportedAt: string;
  categories: Array<{ id: number; name: string; parent_id: number | null }>;
  products: Array<{ id: number; name: string; sku: string | null; price: number | null; unit: string; image_url: string | null; category_id: number; is_custom: boolean; created_at: string }>;
  shoppingLists: Array<{ id: number; name: string; status: string; completed_at: string | null; created_at: string; updated_at: string }>;
  listItems: Array<{ id: number; list_id: number; product_id: number; quantity: number; note: string | null }>;
  favorites: Array<{ product_id: number; created_at: string }>;
}

export async function importPwaExport(file: File): Promise<ImportResult> {
  const text = await file.text();
  const data: PwaExportData = JSON.parse(text);

  if (!data.version || !data.categories || !data.products) {
    throw new Error('Неверный формат файла экспорта');
  }

  const result: ImportResult = {
    categories: 0,
    products: 0,
    lists: 0,
    listItems: 0,
    favorites: 0,
  };

  // Импортируем категории — используем put() чтобы сохранить оригинальные ID
  // (parent_id ссылается на эти ID, поэтому они должны совпадать)
  for (const cat of data.categories) {
    const existing = await db.categories.get(cat.id);
    if (existing) continue;
    await db.categories.put({
      id: cat.id,
      name: cat.name,
      parent_id: cat.parent_id,
    });
    result.categories++;
  }

  // Импортируем товары — используем put() чтобы сохранить оригинальные ID
  // (нужно для корректной работы favorites и listItems)
  for (const prod of data.products) {
    const existing = await db.products.get(prod.id);
    if (existing) continue;

    await db.products.put({
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      price: prod.price,
      unit: prod.unit,
      image_url: prod.image_url,
      category_id: prod.category_id,
      is_custom: prod.is_custom,
      created_at: prod.created_at,
    });
    result.products++;
  }

  // Импортируем списки — сохраняем оригинальные ID
  for (const list of data.shoppingLists) {
    const existing = await db.shoppingLists.get(list.id);
    if (existing) continue;

    await db.shoppingLists.put({
      id: list.id,
      name: list.name,
      status: list.status as 'active' | 'completed',
      completed_at: list.completed_at,
      created_at: list.created_at,
      updated_at: list.updated_at,
    });
    result.lists++;
  }

  // Импортируем позиции списков — сохраняем оригинальные ID
  for (const item of data.listItems) {
    const existing = await db.listItems.get(item.id);
    if (existing) continue;

    await db.listItems.put({
      id: item.id,
      list_id: item.list_id,
      product_id: item.product_id,
      quantity: item.quantity,
      note: item.note,
    });
    result.listItems++;
  }

  // Импортируем избранное — проверяем дубликат по product_id
  for (const fav of data.favorites) {
    const existing = await db.favorites.where('product_id').equals(fav.product_id).first();
    if (existing) continue;

    await db.favorites.add({
      product_id: fav.product_id,
      created_at: fav.created_at,
    });
    result.favorites++;
  }

  return result;
}

/**
 * Экспорт данных из IndexedDB в JSON-файл (для бэкапа или переноса)
 */
export async function exportFromPwa(): Promise<Blob> {
  const categories = await db.categories.toArray();
  const products = await db.products.toArray();
  const shoppingLists = await db.shoppingLists.toArray();
  const listItems = await db.listItems.toArray();
  const favorites = await db.favorites.toArray();

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: categories.map(c => ({ id: c.id!, name: c.name, parent_id: c.parent_id })),
    products: products.map(p => ({
      id: p.id!,
      name: p.name,
      sku: p.sku,
      price: p.price,
      unit: p.unit,
      image_url: p.image_url,
      category_id: p.category_id,
      is_custom: p.is_custom,
      created_at: p.created_at,
    })),
    shoppingLists: shoppingLists.map(l => ({
      id: l.id!,
      name: l.name,
      status: l.status,
      completed_at: l.completed_at,
      created_at: l.created_at,
      updated_at: l.updated_at,
    })),
    listItems: listItems.map(i => ({
      id: i.id!,
      list_id: i.list_id,
      product_id: i.product_id,
      quantity: i.quantity,
      note: i.note,
    })),
    favorites: favorites.map(f => ({
      product_id: f.product_id,
      created_at: f.created_at,
    })),
  };

  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}
