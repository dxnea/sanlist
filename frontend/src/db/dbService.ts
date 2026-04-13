import { db, type CategoryRecord, type ProductRecord, type ShoppingListRecord, type ListItemRecord, type FavoriteRecord } from './database';
import { tokenizeSearch, matchesSearchTokens } from '../utils/searchUtils';

const PRODUCTS_PAGE_SIZE = 120;

// ==================== Categories ====================

export type CategoryTreeRecord = {
  id: number;
  name: string;
  parent_id: number | null;
  children: CategoryTreeRecord[];
};

export async function getCategoriesTree(): Promise<CategoryTreeRecord[]> {
  const all = await db.categories.toArray();
  return buildCategoryTree(all);
}

function buildCategoryTree(flat: CategoryRecord[]): CategoryTreeRecord[] {
  const map = new Map<number, CategoryTreeRecord>();
  for (const row of flat) {
    map.set(row.id!, {
      id: row.id!,
      name: row.name,
      parent_id: row.parent_id,
      children: [],
    });
  }

  const tree: CategoryTreeRecord[] = [];
  for (const row of flat) {
    const node = map.get(row.id!)!;
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id)!.children.push(node);
    } else {
      tree.push(node);
    }
  }

  return tree;
}

export async function createCategory(name: string, parentId: number | null): Promise<CategoryRecord> {
  const id = await db.categories.add({ name, parent_id: parentId });
  const record = await db.categories.get(id);
  return record!;
}

export async function updateCategory(id: number, name: string, parentId: number | null): Promise<CategoryRecord> {
  await db.categories.update(id, { name, parent_id: parentId });
  const record = await db.categories.get(id);
  return record!;
}

export async function deleteCategory(id: number): Promise<void> {
  const uncategorized = await db.categories.where('name').equals('Без категории').first();
  const uncategorizedId = uncategorized?.id ?? null;

  await db.transaction('rw', db.categories, db.products, async () => {
    await db.categories.where('parent_id').equals(id).modify({ parent_id: uncategorizedId });
    await db.products.where('category_id').equals(id).modify({ category_id: uncategorizedId });
    await db.categories.delete(id);
  });
}

// ==================== Products ====================

export interface ProductsQuery {
  search?: string;
  categoryId?: number | null;
  limit?: number;
  offset?: number;
}

export interface ProductsResult {
  items: ProductRecord[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export async function getProducts(query: ProductsQuery = {}): Promise<ProductsResult> {
  const { search = '', categoryId = null, limit = PRODUCTS_PAGE_SIZE, offset = 0 } = query;
  const tokens = tokenizeSearch(search);

  let allProducts = await db.products.orderBy('created_at').reverse().toArray();

  if (tokens.length > 0) {
    allProducts = allProducts.filter((product: ProductRecord) => {
      const nameMatch = matchesSearchTokens(product.name, tokens);
      const skuMatch = product.sku ? matchesSearchTokens(product.sku, tokens) : false;
      return nameMatch || skuMatch;
    });
  }

  if (categoryId) {
    const categoryIds = await getCategoryAndChildrenIds(categoryId);
    allProducts = allProducts.filter((p: ProductRecord) => p.category_id !== null && categoryIds.has(p.category_id));
  }

  const total = allProducts.length;
  const items = allProducts.slice(offset, offset + limit);

  return {
    items,
    total,
    offset,
    limit,
    hasMore: offset + items.length < total,
  };
}

async function getCategoryAndChildrenIds(categoryId: number): Promise<Set<number>> {
  const ids = new Set<number>();
  const queue = [categoryId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ids.add(current);
    const children = await db.categories.where('parent_id').equals(current).toArray();
    for (const child of children) {
      queue.push(child.id!);
    }
  }

  return ids;
}

export async function createProduct(product: Omit<ProductRecord, 'id' | 'created_at'>): Promise<ProductRecord> {
  const now = new Date().toISOString();
  const id = await db.products.add({ ...product, created_at: now });
  const record = await db.products.get(id);
  return record!;
}

export async function updateProduct(id: number, updates: Partial<ProductRecord>): Promise<ProductRecord> {
  await db.products.update(id, updates);
  const record = await db.products.get(id);
  return record!;
}

export async function deleteProduct(id: number): Promise<void> {
  await db.transaction('rw', db.products, db.listItems, db.favorites, async () => {
    await db.listItems.where('product_id').equals(id).delete();
    await db.favorites.where('product_id').equals(id).delete();
    await db.products.delete(id);
  });
}

export async function deleteAllProducts(): Promise<void> {
  await db.transaction('rw', db.products, db.listItems, db.favorites, async () => {
    await db.listItems.clear();
    await db.favorites.clear();
    await db.products.clear();
  });
}

// ==================== Shopping Lists ====================

export async function getShoppingLists(status: 'active' | 'completed'): Promise<ShoppingListRecord[]> {
  return db.shoppingLists.where('status').equals(status).reverse().sortBy('updated_at');
}

export async function createShoppingList(name: string): Promise<ShoppingListRecord> {
  const now = new Date().toISOString();
  const id = await db.shoppingLists.add({
    name,
    status: 'active',
    completed_at: null,
    created_at: now,
    updated_at: now,
  });
  const record = await db.shoppingLists.get(id);
  return record!;
}

export async function updateShoppingList(id: number, name: string): Promise<ShoppingListRecord> {
  await db.shoppingLists.update(id, { name, updated_at: new Date().toISOString() });
  const record = await db.shoppingLists.get(id);
  return record!;
}

export async function deleteShoppingList(id: number, force = false): Promise<void> {
  const list = await db.shoppingLists.get(id);
  if (!list) return;

  if (list.status === 'completed' && !force) {
    throw new Error('Завершённый список можно удалить только с force=true');
  }

  await db.transaction('rw', db.shoppingLists, db.listItems, async () => {
    await db.listItems.where('list_id').equals(id).delete();
    await db.shoppingLists.delete(id);
  });
}

export async function completeShoppingList(id: number): Promise<{ completedList: ShoppingListRecord; activeList: ShoppingListRecord }> {
  const now = new Date().toISOString();
  await db.shoppingLists.update(id, {
    status: 'completed',
    completed_at: now,
    updated_at: now,
  });

  const activeList = await createShoppingList('Новый список');
  const completedList = (await db.shoppingLists.get(id))!;
  return { completedList, activeList };
}

export async function restoreShoppingList(sourceId: number): Promise<{ list: ShoppingListRecord; items: ListItemRecord[] }> {
  const source = await db.shoppingLists.get(sourceId);
  if (!source) throw new Error('Список не найден');

  const items = await db.listItems.where('list_id').equals(sourceId).toArray();
  const newList = await createShoppingList(`${source.name} (повтор)`);

  await db.listItems.bulkAdd(
    items.map((item: ListItemRecord) => ({
      list_id: newList.id!,
      product_id: item.product_id,
      quantity: item.quantity,
      note: item.note,
    }))
  );

  const restoredItems = await db.listItems.where('list_id').equals(newList.id!).toArray();
  return { list: newList, items: restoredItems };
}

// ==================== List Items ====================

export async function getListItems(listId: number): Promise<ListItemRecord[]> {
  return db.listItems.where('list_id').equals(listId).reverse().sortBy('id');
}

export async function addListItem(listId: number, productId: number, quantity: number, note: string | null): Promise<ListItemRecord[]> {
  const existing = await db.listItems
    .where('[list_id+product_id]')
    .equals([listId, productId])
    .first();

  if (existing) {
    await db.listItems.update(existing.id!, {
      quantity: existing.quantity + quantity,
      note: note ?? existing.note,
    });
  } else {
    await db.listItems.add({ list_id: listId, product_id: productId, quantity, note });
  }

  await db.shoppingLists.update(listId, { updated_at: new Date().toISOString() });
  return getListItems(listId);
}

export async function updateListItem(itemId: number, listId: number, payload: { quantity?: number; note?: string | null }): Promise<ListItemRecord[]> {
  await db.listItems.update(itemId, payload);
  await db.shoppingLists.update(listId, { updated_at: new Date().toISOString() });
  return getListItems(listId);
}

export async function deleteListItem(itemId: number, listId: number): Promise<void> {
  await db.listItems.delete(itemId);
  await db.shoppingLists.update(listId, { updated_at: new Date().toISOString() });
}

// ==================== Favorites ====================

export async function getFavorites(): Promise<number[]> {
  const records = await db.favorites.orderBy('created_at').reverse().toArray();
  return records.map((r: FavoriteRecord) => r.product_id);
}

export async function addFavorite(productId: number): Promise<void> {
  const existing = await db.favorites.where('product_id').equals(productId).first();
  if (!existing) {
    await db.favorites.add({
      product_id: productId,
      created_at: new Date().toISOString(),
    });
  }
}

export async function removeFavorite(productId: number): Promise<void> {
  await db.favorites.where('product_id').equals(productId).delete();
}

// ==================== CSV Import ====================

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; field: string; reason: string }>;
}

export async function importProductsFromCsv(
  rows: Array<Record<string, string>>,
  duplicateStrategy: 'skip' | 'update' = 'skip'
): Promise<ImportResult> {
  const results: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const maxErrors = 200;
  let omittedErrors = 0;

  const addError = (row: number, field: string, reason: string) => {
    if (results.errors.length < maxErrors) {
      results.errors.push({ row, field, reason });
    } else {
      omittedErrors++;
    }
  };

  const categoryCache = new Map<string, number>();
  const existingProducts = new Map<string, { id: number; image_url: string | null }>();

  const allProducts = await db.products.toArray();
  for (const p of allProducts) {
    existingProducts.set(p.name, { id: p.id!, image_url: p.image_url });
  }

  const resolveCategory = async (parts: string[]): Promise<number> => {
    const key = parts.join(' > ').toLowerCase();
    if (categoryCache.has(key)) return categoryCache.get(key)!;

    let parentId: number | null = null;
    for (const part of parts) {
      const name = part.trim();
      if (!name) continue;

      let cat = await db.categories.where('name').equals(name).and((c: CategoryRecord) => c.parent_id === parentId).first();
      if (!cat) {
        const id = await db.categories.add({ name, parent_id: parentId });
        cat = await db.categories.get(id);
      }
      parentId = cat!.id!;
    }

    if (parentId === null) {
      const uncategorized = await db.categories.where('name').equals('Без категории').first();
      if (uncategorized?.id) {
        parentId = uncategorized.id;
      } else {
        parentId = await db.categories.add({ name: 'Без категории', parent_id: null });
      }
    }

    categoryCache.set(key, parentId);
    return parentId;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    try {
      const name = (row['Название'] || row['name'] || row['Name'] || row['title'] || '').trim();
      if (!name) {
        addError(rowNum, 'name', 'Название обязательно');
        results.skipped++;
        continue;
      }

      const priceRaw = row['Цена'] || row['price'] || row['Price'] || row['cost'] || '';
      const price = priceRaw ? Number(priceRaw) : null;
      if (priceRaw && (isNaN(price!) || price! < 0)) {
        addError(rowNum, 'price', 'Неверный формат цены');
        results.skipped++;
        continue;
      }

      const unit = (row['Единица измерения'] || row['unit'] || row['Unit'] || 'шт').trim();
      const image_url = (row['Изображение'] || row['image'] || row['image_url'] || row['imageUrl'] || null)?.trim() || null;

      const categoryPathRaw = row['Путь категории'] || row['category_path'] || row['Category Path'] || '';
      const categoryName = row['Категория'] || row['category'] || row['Category'] || '';
      const subcategoryName = row['Подкатегория'] || row['subcategory'] || row['Subcategory'] || '';

      let categoryParts: string[] = [];
      if (categoryPathRaw) {
        categoryParts = categoryPathRaw.split(/\s*(?:\/|\\|>|→|\|)\s*/).map(p => p.trim()).filter(Boolean);
      } else if (categoryName) {
        categoryParts = [categoryName.trim()];
        if (subcategoryName) {
          categoryParts.push(subcategoryName.trim());
        }
      }

      const categoryId = await resolveCategory(categoryParts.length > 0 ? categoryParts : ['Без категории']);

      const existing = existingProducts.get(name);
      if (existing) {
        if (duplicateStrategy === 'skip') {
          results.skipped++;
          continue;
        }

        await db.products.update(existing.id, { unit, price, image_url, category_id: categoryId });
        existingProducts.set(name, { id: existing.id, image_url });
        results.updated++;
        continue;
      }

      const id = await db.products.add({
        name,
        sku: null,
        price,
        unit,
        image_url,
        category_id: categoryId,
        is_custom: false,
        created_at: new Date().toISOString(),
      });
      existingProducts.set(name, { id, image_url });
      results.imported++;
    } catch (error) {
      addError(rowNum, 'unknown', String(error));
      results.skipped++;
    }
  }

  if (omittedErrors > 0) {
    results.errors.push({
      row: 0,
      field: 'summary',
      reason: `Показаны первые ${maxErrors} ошибок. Скрыто ещё: ${omittedErrors}.`,
    });
  }

  return results;
}
