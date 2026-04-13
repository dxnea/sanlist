// Типы данных для приложения

export type Category = {
  id: number;
  name: string;
  parent_id: number | null;
  children: Category[];
};

export type Product = {
  id: number;
  name: string;
  price: number | null;
  unit: string;
  image_url: string | null;
  category_id: number;
  is_custom: boolean;
  created_at: string;
};

export type ListItem = {
  id: number;
  list_id: number;
  product_id: number;
  quantity: number;
  note: string | null;
  product: Product;
};

export type ShoppingList = {
  id: number;
  session_id: string;
  name: string;
  status: 'active' | 'completed';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductFormState = {
  name: string;
  price: string;
  unit: string;
  categoryId: string;
  newCategoryName: string;
  newCategoryParentId: string;
  imageFile: File | null;
};

export type CategoryFormState = {
  id: number | null;
  name: string;
  parentId: string;
};

export type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  tone: 'primary' | 'danger';
};

export type PromptDialogState = {
  isOpen: boolean;
  title: string;
  description: string;
  value: string;
  placeholder: string;
  confirmText: string;
  multiline: boolean;
};

// API типы
export type ProductsResponse = {
  items: Product[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type ApiError = {
  status?: number;
  message: string;
};
