import Dexie, { type Table } from 'dexie';

export interface CategoryRecord {
  id?: number;
  name: string;
  parent_id: number | null;
}

export interface ProductRecord {
  id?: number;
  name: string;
  sku: string | null;
  price: number | null;
  unit: string;
  image_url: string | null;
  category_id: number | null;
  is_custom: boolean;
  created_at: string;
}

export interface ShoppingListRecord {
  id?: number;
  name: string;
  status: 'active' | 'completed';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListItemRecord {
  id?: number;
  list_id: number;
  product_id: number;
  quantity: number;
  note: string | null;
}

export interface FavoriteRecord {
  id?: number;
  product_id: number;
  created_at: string;
}

export class SantexDB extends Dexie {
  categories!: Table<CategoryRecord, number>;
  products!: Table<ProductRecord, number>;
  shoppingLists!: Table<ShoppingListRecord, number>;
  listItems!: Table<ListItemRecord, number>;
  favorites!: Table<FavoriteRecord, number>;

  constructor() {
    super('SantexDB');
    this.version(1).stores({
      categories: '++id, name, parent_id',
      products: '++id, name, sku, category_id, created_at',
      shoppingLists: '++id, status, created_at, updated_at',
      listItems: '++id, list_id, product_id, [list_id+product_id]',
      favorites: '++id, product_id, created_at',
    });
  }
}

export const db = new SantexDB();
