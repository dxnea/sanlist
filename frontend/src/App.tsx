import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import {
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiEye,
  FiMenu,
  FiMessageSquare,
  FiMoon,
  FiPlus,
  FiSearch,
  FiShoppingCart,
  FiStar,
  FiSun,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { useWorkspaceStore } from './store/useWorkspaceStore';

type Category = {
  id: number;
  name: string;
  parent_id: number | null;
  children: Category[];
};

type Product = {
  id: number;
  name: string;
  sku: string | null;
  price: number | null;
  unit: string;
  image_url: string | null;
  category_id: number;
  is_custom: boolean;
  created_at: string;
};

type ListItem = {
  id: number;
  list_id: number;
  product_id: number;
  quantity: number;
  note: string | null;
  product: Product;
};

type ShoppingList = {
  id: number;
  session_id: string;
  name: string;
  status: 'active' | 'completed';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProductFormState = {
  name: string;
  sku: string;
  price: string;
  unit: string;
  categoryId: string;
  newCategoryName: string;
  newCategoryParentId: string;
  imageFile: File | null;
  imageUrl: string;
};

type CategoryFormState = {
  id: number | null;
  name: string;
  parentId: string;
};

type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  tone: 'primary' | 'danger';
};

type PromptDialogState = {
  isOpen: boolean;
  title: string;
  description: string;
  value: string;
  placeholder: string;
  confirmText: string;
  multiline: boolean;
};

const API_BASE = '/api';
const THEME_KEY = 'santex_theme_v1';
const LEGACY_CART_KEY = 'santex_cart_v1';
const LEGACY_MIGRATION_DONE_KEY = 'santex_cart_migrated_v2';
const EXPANDED_KEY = 'santex_expanded_categories_v1';

const emptyProductForm: ProductFormState = {
  name: '',
  sku: '',
  price: '',
  unit: 'шт',
  categoryId: '',
  newCategoryName: '',
  newCategoryParentId: '',
  imageFile: null,
  imageUrl: '',
};

const emptyCategoryForm: CategoryFormState = {
  id: null,
  name: '',
  parentId: '',
};

function flattenCategories(tree: Category[]): Category[] {
  const result: Category[] = [];
  const walk = (nodes: Category[]) => {
    nodes.forEach((node) => {
      result.push(node);
      walk(node.children);
    });
  };
  walk(tree);
  return result;
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number): string {
  const fixed = value.toFixed(3);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function parsePositiveNumber(value: string, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeOptionalText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
    return '';
  }

  return normalized;
}

function getUnitStep(unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized.includes('м')) {
    return 0.1;
  }

  return 1;
}

function getImageUrl(imageUrl: string | null) {
  if (!imageUrl) {
    return 'https://placehold.co/640x420/e2e8f0/64748b?text=Нет+фото';
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  return imageUrl;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function App() {
  const sessionId = useWorkspaceStore((state) => state.sessionId);
  const setSessionId = useWorkspaceStore((state) => state.setSessionId);
  const activeListId = useWorkspaceStore((state) => state.activeListId);
  const setActiveListId = useWorkspaceStore((state) => state.setActiveListId);
  const favoriteProductIds = useWorkspaceStore((state) => state.favoriteProductIds);
  const setFavoriteProductIds = useWorkspaceStore((state) => state.setFavoriteProductIds);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<number[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [activeLists, setActiveLists] = useState<ShoppingList[]>([]);
  const [historyLists, setHistoryLists] = useState<ShoppingList[]>([]);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [drawerTab, setDrawerTab] = useState<'list' | 'history'>('list');

  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [isListBusy, setIsListBusy] = useState(false);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);

  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [previewQty, setPreviewQty] = useState('1');
  const [productQtyDrafts, setProductQtyDrafts] = useState<Record<number, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Подтвердить',
    tone: 'danger',
  });
  const [promptDialog, setPromptDialog] = useState<PromptDialogState>({
    isOpen: false,
    title: '',
    description: '',
    value: '',
    placeholder: '',
    confirmText: 'Сохранить',
    multiline: false,
  });

  const confirmResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);

  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const favoriteSet = useMemo(() => new Set(favoriteProductIds), [favoriteProductIds]);

  const cartCount = useMemo(
    () => listItems.reduce((acc, item) => acc + item.quantity, 0),
    [listItems]
  );
  const cartTotal = useMemo(
    () =>
      listItems.reduce((acc, item) => {
        if (item.product.price === null || item.product.price === undefined) {
          return acc;
        }

        return acc + item.product.price * item.quantity;
      }, 0),
    [listItems]
  );

  const visibleProducts = useMemo(() => {
    if (!showFavoritesOnly) {
      return products;
    }

    return products.filter((product) => favoriteSet.has(product.id));
  }, [products, showFavoritesOnly, favoriteSet]);

  const activeList = useMemo(
    () => activeLists.find((list) => list.id === activeListId) || null,
    [activeLists, activeListId]
  );

  const handleSessionFromHeaders = useCallback(
    (headers: Record<string, unknown>) => {
      const nextSession = typeof headers['x-session-id'] === 'string' ? headers['x-session-id'] : '';
      if (nextSession && nextSession !== sessionId) {
        setSessionId(nextSession);
      }
    },
    [sessionId, setSessionId]
  );

  const apiRequest = useCallback(
    async <T,>(config: AxiosRequestConfig): Promise<T> => {
      const response = await axios.request<T>({
        ...config,
        url: `${API_BASE}${config.url || ''}`,
        headers: {
          ...(config.headers || {}),
          'X-Session-Id': sessionId,
        },
      });

      handleSessionFromHeaders(response.headers as Record<string, unknown>);
      return response.data;
    },
    [sessionId, handleSessionFromHeaders]
  );

  const loadCategories = useCallback(async () => {
    const data = await apiRequest<Category[]>({ url: '/categories' });
    setCategories(data);
  }, [apiRequest]);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const params: Record<string, string | number> = {};
      if (search.trim()) {
        params.search = search.trim();
      }
      if (selectedCategoryId) {
        params.category_id = selectedCategoryId;
      }

      const data = await apiRequest<Product[]>({ url: '/products', params });
      setProducts(data);
    } catch {
      toast.error('Не удалось загрузить товары');
    } finally {
      setIsLoadingProducts(false);
    }
  }, [apiRequest, search, selectedCategoryId]);

  const loadLists = useCallback(
    async (status: 'active' | 'completed') => {
      return apiRequest<ShoppingList[]>({ url: '/lists', params: { status } });
    },
    [apiRequest]
  );

  const loadItemsForList = useCallback(
    async (listId: number) => {
      const data = await apiRequest<ListItem[]>({ url: `/lists/${listId}/items` });
      setListItems(data);
    },
    [apiRequest]
  );

  const refreshFavorites = useCallback(async () => {
    const data = await apiRequest<number[]>({ url: '/favorites' });
    setFavoriteProductIds(data);
  }, [apiRequest, setFavoriteProductIds]);

  const refreshLists = useCallback(async () => {
    try {
      const [active, completed] = await Promise.all([loadLists('active'), loadLists('completed')]);
      let nextActive = active;

      if (nextActive.length === 0) {
        const created = await apiRequest<ShoppingList>({
          url: '/lists',
          method: 'POST',
          data: { name: 'Основной' },
        });
        nextActive = [created];
      }

      setActiveLists(nextActive);
      setHistoryLists(completed);

      if (!activeListId || !nextActive.some((list) => list.id === activeListId)) {
        setActiveListId(nextActive[0].id);
      }
    } catch {
      toast.error('Не удалось загрузить списки');
    }
  }, [loadLists, apiRequest, activeListId, setActiveListId]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expandedCategoryIds));
  }, [expandedCategoryIds]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    void refreshLists();
    void refreshFavorites();
  }, [refreshLists, refreshFavorites]);

  useEffect(() => {
    if (!activeListId) {
      return;
    }

    void loadItemsForList(activeListId);
  }, [activeListId, loadItemsForList]);

  useEffect(() => {
    if (!activeListId) {
      return;
    }

    if (localStorage.getItem(LEGACY_MIGRATION_DONE_KEY) === 'done') {
      return;
    }

    const legacyRaw = localStorage.getItem(LEGACY_CART_KEY);
    if (!legacyRaw) {
      localStorage.setItem(LEGACY_MIGRATION_DONE_KEY, 'done');
      return;
    }

    let cancelled = false;

    const migrate = async () => {
      try {
        const parsed = JSON.parse(legacyRaw) as Record<string, { product?: Product; qty?: number }>;
        const values = Object.values(parsed).filter((item) => item.product?.id && item.qty && item.qty > 0);

        for (const item of values) {
          await apiRequest<ListItem[]>({
            url: `/lists/${activeListId}/items`,
            method: 'POST',
            data: {
              productId: item.product?.id,
              quantity: item.qty,
              note: null,
            },
          });
        }

        if (!cancelled) {
          localStorage.removeItem(LEGACY_CART_KEY);
          localStorage.setItem(LEGACY_MIGRATION_DONE_KEY, 'done');
          await loadItemsForList(activeListId);
          toast.success('Старая корзина перенесена в списки');
        }
      } catch {
        toast.error('Ошибка миграции старой корзины');
      }
    };

    void migrate();

    return () => {
      cancelled = true;
    };
  }, [activeListId, apiRequest, loadItemsForList]);

  const openCreateProductModal = useCallback(() => {
    setEditingProduct(null);
    setProductForm({
      ...emptyProductForm,
      categoryId: selectedCategoryId ? String(selectedCategoryId) : '',
    });
    setImagePreview(null);
    setIsProductModalOpen(true);
  }, [selectedCategoryId]);

  const openEditProductModal = useCallback((product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      sku: product.sku || '',
      price: product.price === null ? '' : String(product.price),
      unit: product.unit,
      categoryId: String(product.category_id),
      newCategoryName: '',
      newCategoryParentId: '',
      imageFile: null,
      imageUrl: '',
    });
    setImagePreview(getImageUrl(product.image_url));
    setIsProductModalOpen(true);
  }, []);

  const closeProductModal = useCallback(() => {
    setIsProductModalOpen(false);
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setImagePreview(null);
  }, []);

  const addToCurrentList = useCallback(
    async (product: Product, quantity = 1, note: string | null = null) => {
      if (!activeListId) {
        toast.error('Нет активного списка');
        return;
      }

      setIsListBusy(true);
      try {
        const data = await apiRequest<ListItem[]>({
          url: `/lists/${activeListId}/items`,
          method: 'POST',
          data: {
            productId: product.id,
            quantity,
            note,
          },
        });
        setListItems(data);
        toast.success('Товар добавлен в список');
      } catch {
        toast.error('Не удалось добавить товар');
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, apiRequest]
  );

  const updateListItem = useCallback(
    async (itemId: number, payload: { quantity?: number; note?: string | null }) => {
      if (!activeListId) {
        return;
      }

      const data = await apiRequest<ListItem[]>({
        url: `/lists/${activeListId}/items/${itemId}`,
        method: 'PUT',
        data: payload,
      });
      setListItems(data);
    },
    [activeListId, apiRequest]
  );

  const deleteListItem = useCallback(
    async (itemId: number) => {
      if (!activeListId) {
        return;
      }

      await apiRequest<void>({
        url: `/lists/${activeListId}/items/${itemId}`,
        method: 'DELETE',
      });
      setListItems((prev) => prev.filter((item) => item.id !== itemId));
    },
    [activeListId, apiRequest]
  );

  const toggleFavorite = useCallback(
    async (productId: number) => {
      const isFavorite = favoriteSet.has(productId);
      try {
        if (isFavorite) {
          await apiRequest<void>({ url: `/favorites/${productId}`, method: 'DELETE' });
          setFavoriteProductIds(favoriteProductIds.filter((id) => id !== productId));
        } else {
          await apiRequest({ url: '/favorites', method: 'POST', data: { productId } });
          setFavoriteProductIds([...favoriteProductIds, productId]);
        }
      } catch {
        toast.error('Не удалось обновить избранное');
      }
    },
    [apiRequest, favoriteSet, favoriteProductIds, setFavoriteProductIds]
  );

  const openConfirmDialog = useCallback(
    (config: {
      title: string;
      description?: string;
      confirmText?: string;
      tone?: 'primary' | 'danger';
    }) =>
      new Promise<boolean>((resolve) => {
        confirmResolverRef.current = resolve;
        setConfirmDialog({
          isOpen: true,
          title: config.title,
          description: config.description || '',
          confirmText: config.confirmText || 'Подтвердить',
          tone: config.tone || 'danger',
        });
      }),
    []
  );

  const closeConfirmDialog = useCallback((accepted: boolean) => {
    confirmResolverRef.current?.(accepted);
    confirmResolverRef.current = null;
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openPromptDialog = useCallback(
    (config: {
      title: string;
      description?: string;
      initialValue?: string;
      placeholder?: string;
      confirmText?: string;
      multiline?: boolean;
    }) =>
      new Promise<string | null>((resolve) => {
        promptResolverRef.current = resolve;
        setPromptDialog({
          isOpen: true,
          title: config.title,
          description: config.description || '',
          value: config.initialValue || '',
          placeholder: config.placeholder || '',
          confirmText: config.confirmText || 'Сохранить',
          multiline: Boolean(config.multiline),
        });
      }),
    []
  );

  const closePromptDialog = useCallback((value: string | null) => {
    promptResolverRef.current?.(value);
    promptResolverRef.current = null;
    setPromptDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const renameActiveList = useCallback(async () => {
    if (!activeList) {
      return;
    }

    const nextName = (await openPromptDialog({
      title: 'Переименовать список',
      description: 'Введите новое название списка',
      initialValue: activeList.name,
      placeholder: 'Название списка',
      confirmText: 'Сохранить',
    }))?.trim();
    if (!nextName) {
      return;
    }

    try {
      await apiRequest<ShoppingList>({
        url: `/lists/${activeList.id}`,
        method: 'PUT',
        data: { name: nextName },
      });
      await refreshLists();
      toast.success('Список переименован');
    } catch {
      toast.error('Не удалось переименовать список');
    }
  }, [activeList, apiRequest, refreshLists, openPromptDialog]);

  const createNewList = useCallback(async () => {
    const rawName = await openPromptDialog({
      title: 'Новый список',
      description: 'Введите название нового списка',
      initialValue: 'Новый список',
      placeholder: 'Название списка',
      confirmText: 'Создать',
    });
    if (rawName === null) {
      return;
    }

    const name = rawName.trim() || 'Новый список';
    try {
      const created = await apiRequest<ShoppingList>({
        url: '/lists',
        method: 'POST',
        data: { name },
      });
      await refreshLists();
      setActiveListId(created.id);
      toast.success('Новый список создан');
    } catch {
      toast.error('Не удалось создать список');
    }
  }, [apiRequest, refreshLists, setActiveListId, openPromptDialog]);

  const deleteActiveList = useCallback(async () => {
    if (!activeList) {
      return;
    }

    const shouldDelete = await openConfirmDialog({
      title: `Удалить список «${activeList.name}»?`,
      description: 'Список будет удалён без возможности восстановления.',
      confirmText: 'Удалить',
      tone: 'danger',
    });
    if (!shouldDelete) {
      return;
    }

    try {
      await apiRequest<void>({
        url: `/lists/${activeList.id}`,
        method: 'DELETE',
      });
      await refreshLists();
      toast.success('Список удалён');
    } catch {
      toast.error('Не удалось удалить список');
    }
  }, [activeList, apiRequest, refreshLists, openConfirmDialog]);

  const completeCurrentList = useCallback(async () => {
    if (!activeListId) {
      return;
    }

    try {
      const data = await apiRequest<{ completedList: ShoppingList; activeList: ShoppingList }>({
        url: `/lists/${activeListId}/complete`,
        method: 'POST',
      });
      setActiveListId(data.activeList.id);
      await refreshLists();
      setDrawerTab('history');
      toast.success('Список завершён и перенесён в историю');
    } catch {
      toast.error('Не удалось завершить список');
    }
  }, [activeListId, apiRequest, refreshLists, setActiveListId]);

  const restoreFromHistory = useCallback(
    async (listId: number) => {
      try {
        const data = await apiRequest<{ list: ShoppingList; items: ListItem[] }>({
          url: `/lists/${listId}/restore`,
          method: 'POST',
        });
        setActiveListId(data.list.id);
        setListItems(data.items);
        setDrawerTab('list');
        await refreshLists();
        toast.success('Заказ восстановлен в новый список');
      } catch {
        toast.error('Не удалось восстановить заказ');
      }
    },
    [apiRequest, refreshLists, setActiveListId]
  );

  const clearCurrentList = useCallback(async () => {
    if (!activeListId || listItems.length === 0) {
      return;
    }

    const shouldClear = await openConfirmDialog({
      title: 'Очистить текущий список?',
      description: 'Все позиции будут удалены из текущего списка.',
      confirmText: 'Очистить',
      tone: 'danger',
    });
    if (!shouldClear) {
      return;
    }

    try {
      await Promise.all(
        listItems.map((item) =>
          apiRequest<void>({
            url: `/lists/${activeListId}/items/${item.id}`,
            method: 'DELETE',
          })
        )
      );
      setListItems([]);
      toast.success('Список очищен');
    } catch {
      toast.error('Не удалось очистить список');
    }
  }, [activeListId, listItems, apiRequest, openConfirmDialog]);

  const exportCartToTxt = useCallback(() => {
    if (listItems.length === 0) {
      toast.error('Список пустой');
      return;
    }

    const lines = [
      'Список сантехнических товаров',
      `Дата: ${new Date().toLocaleString('ru-RU')}`,
      `Список: ${activeList?.name || 'Без названия'}`,
      '',
      ...listItems.map((item) => {
        const priceValue = item.product.price;
        const hasPrice = typeof priceValue === 'number';
        const amount = hasPrice ? priceValue * item.quantity : null;
        const noteValue = normalizeOptionalText(item.note);
        const skuValue = normalizeOptionalText(item.product.sku);
        const notePart = noteValue ? ` (${noteValue})` : '';

        return [
          `${item.product.name}${notePart}`,
          skuValue ? `Арт: ${skuValue}` : null,
          `Кол-во: ${formatQuantity(item.quantity)} ${item.product.unit}`,
          hasPrice ? `Цена: ${priceValue} ₽ / ${item.product.unit}` : null,
          hasPrice && amount !== null ? `Сумма: ${amount.toFixed(2)} ₽` : null,
        ]
          .filter(Boolean)
          .join(' | ');
      }),
      '',
      `Позиции: ${listItems.length}`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeList?.name || 'santex-list'}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('TXT экспортирован');
  }, [listItems, activeList]);

  const editItemNote = useCallback(
    async (item: ListItem) => {
      const currentNote = normalizeOptionalText(item.note);
      const next = await openPromptDialog({
        title: 'Заметка к позиции',
        description: item.product.name,
        initialValue: currentNote,
        placeholder: 'Например: взять другой диаметр',
        confirmText: 'Сохранить',
        multiline: true,
      });
      if (next === null) {
        return;
      }

      try {
        await updateListItem(item.id, { note: next.trim() || null });
      } catch {
        toast.error('Не удалось сохранить заметку');
      }
    },
    [updateListItem, openPromptDialog]
  );

  const submitProductForm = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!productForm.name.trim()) {
        toast.error('Введите название товара');
        return;
      }

      if (productForm.price.trim() && Number(productForm.price) < 0) {
        toast.error('Цена не может быть отрицательной');
        return;
      }

      try {
        let categoryId = productForm.categoryId;
        if (productForm.newCategoryName.trim()) {
          const createdCategory = await apiRequest<Category>({
            url: '/categories',
            method: 'POST',
            data: {
              name: productForm.newCategoryName.trim(),
              parent_id: productForm.newCategoryParentId ? Number(productForm.newCategoryParentId) : null,
            },
          });
          categoryId = String(createdCategory.id);
          await loadCategories();
        }

        if (!categoryId) {
          toast.error('Выберите категорию');
          return;
        }

        const formData = new FormData();
        formData.append('name', productForm.name.trim());
        formData.append('sku', productForm.sku.trim());
        formData.append('price', productForm.price.trim());
        formData.append('unit', productForm.unit.trim() || 'шт');
        formData.append('category_id', categoryId);

        if (!editingProduct) {
          formData.append('is_custom', 'true');
        }

        if (productForm.imageFile) {
          formData.append('image', productForm.imageFile);
        }

        if (editingProduct) {
          await apiRequest({
            url: `/products/${editingProduct.id}`,
            method: 'PUT',
            data: formData,
          });
          toast.success('Товар обновлён');
        } else {
          await apiRequest({ url: '/products', method: 'POST', data: formData });
          toast.success('Товар добавлен');
        }

        closeProductModal();
        await loadProducts();
      } catch {
        toast.error('Не удалось сохранить товар');
      }
    },
    [productForm, editingProduct, apiRequest, loadCategories, closeProductModal, loadProducts]
  );

  const deleteProduct = useCallback(
    async (product: Product) => {
      const shouldDelete = await openConfirmDialog({
        title: `Удалить товар «${product.name}»?`,
        description: 'Товар исчезнет из каталога и активных списков.',
        confirmText: 'Удалить',
        tone: 'danger',
      });
      if (!shouldDelete) {
        return;
      }

      try {
        await apiRequest({ url: `/products/${product.id}`, method: 'DELETE' });
        toast.success('Товар удалён');
        await loadProducts();
        setListItems((prev) => prev.filter((item) => item.product_id !== product.id));
        setFavoriteProductIds(favoriteProductIds.filter((id) => id !== product.id));
      } catch {
        toast.error('Ошибка удаления');
      }
    },
    [apiRequest, loadProducts, favoriteProductIds, setFavoriteProductIds, openConfirmDialog]
  );

  const openCategoryCreateModal = useCallback(() => {
    setCategoryForm(emptyCategoryForm);
    setIsCategoryModalOpen(true);
  }, []);

  const openCategoryEditModal = useCallback((category: Category) => {
    setCategoryForm({
      id: category.id,
      name: category.name,
      parentId: category.parent_id ? String(category.parent_id) : '',
    });
    setIsCategoryModalOpen(true);
  }, []);

  const submitCategoryForm = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!categoryForm.name.trim()) {
        toast.error('Введите название категории');
        return;
      }

      try {
        if (categoryForm.id) {
          await apiRequest({
            url: `/categories/${categoryForm.id}`,
            method: 'PUT',
            data: {
              name: categoryForm.name.trim(),
              parent_id: categoryForm.parentId ? Number(categoryForm.parentId) : null,
            },
          });
          toast.success('Категория обновлена');
        } else {
          await apiRequest({
            url: '/categories',
            method: 'POST',
            data: {
              name: categoryForm.name.trim(),
              parent_id: categoryForm.parentId ? Number(categoryForm.parentId) : null,
            },
          });
          toast.success('Категория создана');
        }

        setIsCategoryModalOpen(false);
        await loadCategories();
      } catch {
        toast.error('Не удалось сохранить категорию');
      }
    },
    [categoryForm, apiRequest, loadCategories]
  );

  const deleteCategory = useCallback(
    async (category: Category) => {
      const shouldDelete = await openConfirmDialog({
        title: `Удалить категорию «${category.name}»?`,
        description: 'Товары будут перемещены в «Без категории».',
        confirmText: 'Удалить',
        tone: 'danger',
      });
      if (!shouldDelete) {
        return;
      }

      try {
        await apiRequest({ url: `/categories/${category.id}`, method: 'DELETE' });
        toast.success('Категория удалена');
        if (selectedCategoryId === category.id) {
          setSelectedCategoryId(null);
        }
        await Promise.all([loadCategories(), loadProducts()]);
      } catch {
        toast.error('Не удалось удалить категорию');
      }
    },
    [apiRequest, selectedCategoryId, loadCategories, loadProducts, openConfirmDialog]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const editable = isEditableElement(event.target);

      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (editable) {
        return;
      }

      if (event.key === 'Escape') {
        if (promptDialog.isOpen) {
          closePromptDialog(null);
        } else if (confirmDialog.isOpen) {
          closeConfirmDialog(false);
        } else if (previewProduct) {
          setPreviewProduct(null);
        } else if (isProductModalOpen) {
          closeProductModal();
        } else if (isCategoryModalOpen) {
          setIsCategoryModalOpen(false);
        } else if (isCartOpen) {
          setIsCartOpen(false);
        } else if (isCategorySheetOpen) {
          setIsCategorySheetOpen(false);
        } else if (search) {
          setSearch('');
        }
        return;
      }

      if (event.key.toLowerCase() === 'c') {
        setIsCartOpen((prev) => !prev);
        return;
      }

      if (event.key.toLowerCase() === 'a') {
        openCreateProductModal();
        return;
      }

      if (event.key.toLowerCase() === 'd') {
        void deleteActiveList();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    promptDialog.isOpen,
    confirmDialog.isOpen,
    previewProduct,
    isProductModalOpen,
    isCategoryModalOpen,
    isCartOpen,
    isCategorySheetOpen,
    search,
    closePromptDialog,
    closeConfirmDialog,
    closeProductModal,
    openCreateProductModal,
    deleteActiveList,
  ]);

  function toggleExpandedCategory(id: number) {
    setExpandedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function openPreview(product: Product) {
    setPreviewProduct(product);
    setPreviewQty('1');
  }

  function renderCategoryNode(category: Category, level = 0): ReactElement {
    const isExpanded = expandedCategoryIds.includes(category.id);
    const hasChildren = category.children.length > 0;
    const isSelected = selectedCategoryId === category.id;

    return (
      <div key={category.id}>
        <div className={`category-row ${isSelected ? 'active' : ''}`} style={{ paddingLeft: `${12 + level * 14}px` }}>
          {hasChildren ? (
            <button className="icon-btn ghost" onClick={() => toggleExpandedCategory(category.id)} type="button">
              {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
            </button>
          ) : (
            <span className="category-spacer" />
          )}
          <button
            type="button"
            className="category-select"
            onClick={() => {
              setSelectedCategoryId(category.id);
              setIsCategorySheetOpen(false);
            }}
          >
            {category.name}
          </button>
          <button className="icon-btn ghost" onClick={() => openCategoryEditModal(category)} type="button">
            <FiEdit2 />
          </button>
          <button className="icon-btn danger" onClick={() => void deleteCategory(category)} type="button">
            <FiTrash2 />
          </button>
        </div>

        {hasChildren && isExpanded && category.children.map((child) => renderCategoryNode(child, level + 1))}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-btn mobile-only" onClick={() => setIsCategorySheetOpen(true)} type="button">
          <FiMenu />
        </button>
        <div className="brand">Сантехнический помощник</div>

        <div className="search-wrap">
          <FiSearch className="search-icon" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="search-input"
            placeholder="Поиск по названию и артикулу"
          />
        </div>

        <div className="topbar-actions">
          <button
            className="btn btn-soft theme-btn"
            type="button"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            aria-label="Переключить тему"
          >
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
          <button
            className={`btn btn-soft ${showFavoritesOnly ? 'active-filter' : ''}`}
            type="button"
            onClick={() => setShowFavoritesOnly((prev) => !prev)}
          >
            <FiStar />
            <span>Избранное</span>
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreateProductModal}>
            <FiPlus />
            <span>Добавить товар</span>
          </button>
          <button className="btn btn-soft cart-btn" type="button" onClick={() => setIsCartOpen(true)}>
            <FiShoppingCart />
            <span>{formatQuantity(cartCount)}</span>
          </button>
        </div>
      </header>

      <main className="main-layout">
        <aside className="sidebar desktop-only">
          <div className="panel-header">
            <h3>Категории</h3>
            <button className="btn btn-soft" type="button" onClick={openCategoryCreateModal}>
              <FiPlus />
            </button>
          </div>

          <button
            className={`all-categories-btn ${selectedCategoryId === null ? 'active' : ''}`}
            onClick={() => setSelectedCategoryId(null)}
            type="button"
          >
            Все товары
          </button>
          <div className="categories-tree">{categories.map((category) => renderCategoryNode(category))}</div>
        </aside>

        <section className="content">
          <div className="content-top">
            <h2>{selectedCategoryId ? 'Товары категории' : 'Все товары'}</h2>
            <div className="products-count">
              {visibleProducts.length} шт. {showFavoritesOnly ? '• только избранное' : ''}
            </div>
          </div>

          {isLoadingProducts ? <div className="state-box">Загрузка...</div> : null}
          {!isLoadingProducts && visibleProducts.length === 0 ? (
            <div className="state-box">По вашему запросу ничего не найдено</div>
          ) : null}

          <div className="products-grid">
            {visibleProducts.map((product) => {
              const isFavorite = favoriteSet.has(product.id);
              const qtyDraft = Object.prototype.hasOwnProperty.call(productQtyDrafts, product.id)
                ? productQtyDrafts[product.id]
                : '';

              return (
                <article key={product.id} className="product-card">
                  <button className="image-action" type="button" onClick={() => openPreview(product)}>
                    <img src={getImageUrl(product.image_url)} alt={product.name} className="product-image" loading="lazy" />
                  </button>
                  <div className="product-body">
                    <div className="product-top-row">
                      <h4>{product.name}</h4>
                      <div className="product-top-actions">
                        <button className={`icon-btn ghost ${isFavorite ? 'starred' : ''}`} type="button" onClick={() => void toggleFavorite(product.id)}>
                          <FiStar />
                        </button>
                        {product.is_custom ? <span className="badge">custom</span> : null}
                      </div>
                    </div>
                    <p className="sku">Артикул: {product.sku || '—'}</p>
                    <div className="price-line">
                      {product.price !== null ? <strong>{formatPrice(product.price)} / {product.unit}</strong> : <strong>{product.unit}</strong>}
                    </div>
                    <div className="quick-add-row">
                      <label className="quantity-input-group">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={qtyDraft}
                          placeholder="1"
                          inputMode="decimal"
                          onChange={(event) =>
                            setProductQtyDrafts((prev) => ({
                              ...prev,
                              [product.id]: event.target.value,
                            }))
                          }
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <span>{product.unit}</span>
                      </label>
                    </div>
                    <div className="product-footer">
                      <div className="product-actions">
                        <button className="icon-btn ghost" type="button" onClick={() => openPreview(product)}>
                          <FiEye />
                        </button>
                        <button className="icon-btn ghost" type="button" onClick={() => openEditProductModal(product)}>
                          <FiEdit2 />
                        </button>
                        <button className="icon-btn danger" type="button" onClick={() => void deleteProduct(product)}>
                          <FiTrash2 />
                        </button>
                      </div>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={isListBusy}
                        onClick={() =>
                          void addToCurrentList(
                            product,
                            parsePositiveNumber(qtyDraft, 1)
                          )
                        }
                      >
                        <FiPlus />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <button className="fab mobile-only" onClick={() => setIsCartOpen(true)} type="button">
        <FiShoppingCart />
        <span>{formatQuantity(cartCount)}</span>
      </button>

      <div className={`drawer-overlay ${isCartOpen ? 'visible' : ''}`} onClick={() => setIsCartOpen(false)} />
      <aside className={`cart-drawer ${isCartOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>Черновики и история</h3>
          <button className="icon-btn ghost" type="button" onClick={() => setIsCartOpen(false)}>
            <FiX />
          </button>
        </div>

        <div className="drawer-tabs">
          <button className={drawerTab === 'list' ? 'active' : ''} type="button" onClick={() => setDrawerTab('list')}>
            <FiShoppingCart /> Список
          </button>
          <button className={drawerTab === 'history' ? 'active' : ''} type="button" onClick={() => setDrawerTab('history')}>
            <FiClock /> История
          </button>
        </div>

        {drawerTab === 'list' ? (
          <>
            <div className="list-controls">
              <select
                value={activeListId || ''}
                onChange={(event) => setActiveListId(Number(event.target.value) || null)}
              >
                {activeLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              <div className="list-controls-actions">
                <button className="btn btn-soft" type="button" onClick={() => void createNewList()}>
                  <FiPlus />
                </button>
                <button className="btn btn-soft" type="button" onClick={() => void renameActiveList()} disabled={!activeList}>
                  <FiEdit2 />
                </button>
                <button className="btn btn-soft" type="button" onClick={() => void deleteActiveList()} disabled={!activeList}>
                  <FiTrash2 />
                </button>
              </div>
            </div>

            <div className="cart-items">
              {listItems.length === 0 ? <p className="muted">Добавьте товары в текущий список</p> : null}
              {listItems.map((item) => {
                const step = getUnitStep(item.product.unit);
                const priceValue = item.product.price;
                const hasPrice = typeof priceValue === 'number';
                const lineTotal = hasPrice ? priceValue * item.quantity : null;
                const noteValue = normalizeOptionalText(item.note);

                return (
                  <div key={item.id} className="cart-item">
                    <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                    <div>
                      <p>{item.product.name}</p>
                      <div className="cart-item-meta">
                        <span>{formatQuantity(item.quantity)} {item.product.unit}</span>
                        {hasPrice ? <strong>{formatPrice(priceValue)}</strong> : <span className="muted">цена не указана</span>}
                        {lineTotal !== null ? <em>{formatPrice(lineTotal)}</em> : null}
                      </div>
                      {noteValue ? <p className="item-note">📝 {noteValue}</p> : null}
                    </div>
                    <div className="qty-box">
                      <button
                        type="button"
                        className="icon-btn ghost"
                        onClick={() =>
                          void updateListItem(item.id, {
                            quantity: Math.max(step, Number((item.quantity - step).toFixed(3))),
                          })
                        }
                        aria-label="Уменьшить количество"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="icon-btn ghost"
                        onClick={() =>
                          void updateListItem(item.id, {
                            quantity: Number((item.quantity + step).toFixed(3)),
                          })
                        }
                        aria-label="Увеличить количество"
                      >
                        +
                      </button>
                      <button type="button" className={`icon-btn ghost ${item.note ? 'with-note' : ''}`} onClick={() => void editItemNote(item)}>
                        <FiMessageSquare />
                      </button>
                      <button type="button" className="icon-btn danger" onClick={() => void deleteListItem(item.id)}>
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="cart-footer">
              <div className="cart-summary">
                <span>Позиции: {listItems.length}</span>
                <strong>{formatPrice(cartTotal)}</strong>
              </div>
              <div className="cart-buttons">
                <button className="btn btn-soft" type="button" onClick={() => void clearCurrentList()}>
                  Очистить
                </button>
                <button className="btn btn-soft" type="button" onClick={exportCartToTxt}>
                  <FiCheck /> Экспорт
                </button>
                <button className="btn btn-primary" type="button" onClick={() => void completeCurrentList()} disabled={!activeList || listItems.length === 0}>
                  <FiClock /> Завершить
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="history-list">
            {historyLists.length === 0 ? <p className="muted">История пока пустая</p> : null}
            {historyLists.map((list) => (
              <article key={list.id} className="history-item">
                <div>
                  <h4>{list.name}</h4>
                  <p>{list.completed_at ? new Date(list.completed_at).toLocaleString('ru-RU') : 'Без даты'}</p>
                </div>
                <div className="history-actions">
                  <button className="btn btn-soft" type="button" onClick={() => void restoreFromHistory(list.id)}>
                    Повторить заказ
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </aside>

      <div className={`drawer-overlay ${isCategorySheetOpen ? 'visible' : ''}`} onClick={() => setIsCategorySheetOpen(false)} />
      <aside className={`mobile-categories ${isCategorySheetOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>Категории</h3>
          <div className="panel-header-actions">
            <button className="btn btn-soft" type="button" onClick={openCategoryCreateModal}>
              <FiPlus />
            </button>
            <button className="icon-btn ghost" type="button" onClick={() => setIsCategorySheetOpen(false)}>
              <FiX />
            </button>
          </div>
        </div>

        <button
          className={`all-categories-btn ${selectedCategoryId === null ? 'active' : ''}`}
          onClick={() => {
            setSelectedCategoryId(null);
            setIsCategorySheetOpen(false);
          }}
          type="button"
        >
          Все товары
        </button>
        <div className="categories-tree">{categories.map((category) => renderCategoryNode(category))}</div>
      </aside>

      {previewProduct ? (
        <div className="modal-overlay" onClick={() => setPreviewProduct(null)}>
          <div className="modal preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h3>Быстрый предпросмотр</h3>
              <button className="icon-btn ghost" type="button" onClick={() => setPreviewProduct(null)}>
                <FiX />
              </button>
            </div>
            <div className="preview-layout">
              <img src={getImageUrl(previewProduct.image_url)} alt={previewProduct.name} className="preview-image" />
              <div className="preview-body">
                <h4>{previewProduct.name}</h4>
                <p>Артикул: {previewProduct.sku || '—'}</p>
                <p>
                  {previewProduct.price !== null
                    ? `${formatPrice(previewProduct.price)} / ${previewProduct.unit}`
                    : `Единица: ${previewProduct.unit}`}
                </p>
                <div className="quick-add-row">
                  <label className="quantity-input-group">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={previewQty}
                      placeholder="1"
                      inputMode="decimal"
                      onChange={(event) => setPreviewQty(event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <span>{previewProduct.unit}</span>
                  </label>
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() =>
                    void addToCurrentList(
                      previewProduct,
                      parsePositiveNumber(previewQty, getUnitStep(previewProduct.unit))
                    )
                  }
                >
                  <FiPlus /> Добавить в корзину
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isProductModalOpen ? (
        <div className="modal-overlay" onClick={closeProductModal}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h3>{editingProduct ? 'Редактирование товара' : 'Новый товар'}</h3>
              <button className="icon-btn ghost" type="button" onClick={closeProductModal}>
                <FiX />
              </button>
            </div>

            <form className="form-grid" onSubmit={(event) => void submitProductForm(event)}>
              <label>
                Название *
                <input
                  value={productForm.name}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Артикул
                <input
                  value={productForm.sku}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, sku: event.target.value }))}
                />
              </label>
              <label>
                Цена
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Не указана"
                  value={productForm.price}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, price: event.target.value }))}
                />
              </label>
              <label>
                Единица
                <input
                  value={productForm.unit}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, unit: event.target.value }))}
                  placeholder="шт"
                />
              </label>
              <label>
                Категория
                <select
                  value={productForm.categoryId}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                >
                  <option value="">Выберите категорию</option>
                  {flatCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              {!editingProduct ? (
                <>
                  <label>
                    Или новая категория
                    <input
                      value={productForm.newCategoryName}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, newCategoryName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Родитель новой категории
                    <select
                      value={productForm.newCategoryParentId}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, newCategoryParentId: event.target.value }))
                      }
                    >
                      <option value="">Без родителя</option>
                      {flatCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              <label className="full-row">
                Изображение
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setProductForm((prev) => ({ ...prev, imageFile: file }));
                    setImagePreview(file ? URL.createObjectURL(file) : editingProduct ? getImageUrl(editingProduct.image_url) : null);
                  }}
                />
              </label>

              {imagePreview ? (
                <div className="image-preview-wrap full-row">
                  <img src={imagePreview} alt="preview" className="image-preview" />
                </div>
              ) : null}

              <div className="modal-actions full-row">
                <button className="btn btn-soft" type="button" onClick={closeProductModal}>
                  Отмена
                </button>
                <button className="btn btn-primary" type="submit">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCategoryModalOpen ? (
        <div className="modal-overlay" onClick={() => setIsCategoryModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h3>{categoryForm.id ? 'Редактировать категорию' : 'Новая категория'}</h3>
              <button className="icon-btn ghost" type="button" onClick={() => setIsCategoryModalOpen(false)}>
                <FiX />
              </button>
            </div>

            <form className="form-grid" onSubmit={(event) => void submitCategoryForm(event)}>
              <label>
                Название
                <input
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Родитель
                <select
                  value={categoryForm.parentId}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, parentId: event.target.value }))}
                >
                  <option value="">Без родителя</option>
                  {flatCategories
                    .filter((category) => category.id !== categoryForm.id)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="modal-actions full-row">
                <button className="btn btn-soft" type="button" onClick={() => setIsCategoryModalOpen(false)}>
                  Отмена
                </button>
                <button className="btn btn-primary" type="submit">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmDialog.isOpen ? (
        <div className="modal-overlay" onClick={() => closeConfirmDialog(false)}>
          <div className="modal compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-content">
              <h3>{confirmDialog.title}</h3>
              {confirmDialog.description ? <p>{confirmDialog.description}</p> : null}
            </div>
            <div className="modal-actions">
              <button className="btn btn-soft" type="button" onClick={() => closeConfirmDialog(false)}>
                Отмена
              </button>
              <button
                className={`btn ${confirmDialog.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                type="button"
                onClick={() => closeConfirmDialog(true)}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {promptDialog.isOpen ? (
        <div className="modal-overlay" onClick={() => closePromptDialog(null)}>
          <div className="modal compact-modal" onClick={(event) => event.stopPropagation()}>
            <form
              className="dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                closePromptDialog(promptDialog.value);
              }}
            >
              <div className="dialog-content">
                <h3>{promptDialog.title}</h3>
                {promptDialog.description ? <p>{promptDialog.description}</p> : null}
                {promptDialog.multiline ? (
                  <textarea
                    value={promptDialog.value}
                    placeholder={promptDialog.placeholder}
                    onChange={(event) => setPromptDialog((prev) => ({ ...prev, value: event.target.value }))}
                    rows={4}
                  />
                ) : (
                  <input
                    value={promptDialog.value}
                    placeholder={promptDialog.placeholder}
                    onChange={(event) => setPromptDialog((prev) => ({ ...prev, value: event.target.value }))}
                    autoFocus
                  />
                )}
              </div>
              <div className="modal-actions">
                <button className="btn btn-soft" type="button" onClick={() => closePromptDialog(null)}>
                  Отмена
                </button>
                <button className="btn btn-primary" type="submit">
                  {promptDialog.confirmText}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
