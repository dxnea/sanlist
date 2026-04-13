import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from './hooks/useDebounce';
import toast from 'react-hot-toast';
import { VirtualProductsGrid } from './components/VirtualProductsGrid';
import {
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiMenu,
  FiMessageSquare,
  FiMoon,
  FiPlus,
  FiSearch,
  FiShoppingCart,
  FiSliders,
  FiStar,
  FiSun,
  FiTrendingUp,
  FiTrash2,
  FiUpload,
  FiX,
} from 'react-icons/fi';
import { useWorkspaceStore } from './store/useWorkspaceStore';
import { useProducts } from './hooks/useProducts';
import { readFileAsDataURL } from './utils/fileReader';
import { importPwaExport } from './db/importExport';

type Category = {
  id: number;
  name: string;
  parent_id: number | null;
  children: Category[];
};

type Product = {
  id: number;
  name: string;
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

const THEME_KEY = 'santex_theme_v1';
const LEGACY_CART_KEY = 'santex_cart_v1';
const LEGACY_MIGRATION_DONE_KEY = 'santex_cart_migrated_v2';
const EXPANDED_KEY = 'santex_expanded_categories_v1';
const CATALOG_DESKTOP_COLUMNS_KEY = 'santex_catalog_desktop_columns_v1';
const CATALOG_MOBILE_COLUMNS_KEY = 'santex_catalog_mobile_columns_v1';
const CATALOG_COMPACT_KEY = 'santex_catalog_compact_v1';

const emptyProductForm: ProductFormState = {
  name: '',
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




// type VirtualProductsGridProps = {
//   products: Product[];
//   favoriteSet: Set<number>;
//   qtyDrafts: Record<number, string>;
//   isListBusy: boolean;
//   isCompact: boolean;
//   desktopColumns: 1 | 2 | 3 | 4 | 5;
//   mobileColumns: 1 | 2 | 3 | 4 | 5;
//   hasMoreProducts: boolean;
//   isLoadingMoreProducts: boolean;
//   onLoadMoreProducts: () => void;
//   onOpenPreview: (product: Product) => void;
//   onToggleFavorite: (productId: number) => void;
//   onEditProduct: (product: Product) => void;
//   onDeleteProduct: (product: Product) => void;
//   onQtyDraftChange: (productId: number, value: string) => void;
//   onAddToCurrentList: (product: Product, quantity: number) => void;
//   lastLoadMoreRowRef: React.MutableRefObject<number>;
// };

// function VirtualProductsGrid(props: VirtualProductsGridProps) {
//   const {
//     products,
//     favoriteSet,
//     qtyDrafts,
//     isListBusy,
//     isCompact,
//     desktopColumns,
//     mobileColumns,
//     hasMoreProducts,
//     isLoadingMoreProducts,
//     onLoadMoreProducts,
//     onOpenPreview,
//     onToggleFavorite,
//     onEditProduct,
//     onDeleteProduct,
//     onQtyDraftChange,
//     onAddToCurrentList,
//     lastLoadMoreRowRef,
//   } = props;

//   const viewportRef = useRef<HTMLDivElement | null>(null);
//   const scrollTopRef = useRef(0);
//   const prevLengthRef = useRef(products.length);
//   const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

//   useEffect(() => {
//     const element = viewportRef.current;
//     if (!element) {
//       return;
//     }

//     const resize = () => {
//       setViewportSize({
//         width: Math.max(0, element.clientWidth),
//         height: Math.max(0, element.clientHeight),
//       });
//     };

//     resize();

//     const observer = new ResizeObserver(() => resize());
//     observer.observe(element);
//     return () => observer.disconnect();
//   }, []);

//   // Восстанавливаем позицию скролла после подгрузки товаров
//   useEffect(() => {
//     const prevLength = prevLengthRef.current;
//     const currentLength = products.length;
    
//     // Если товары добавились (режим append) и мы были у конца списка
//     if (currentLength > prevLength && scrollTopRef.current > 0 && viewportRef.current) {
//       requestAnimationFrame(() => {
//         if (viewportRef.current) {
//           viewportRef.current.scrollTop = scrollTopRef.current;
//         }
//       });
//     }
    
//     prevLengthRef.current = currentLength;
//   }, [products.length]);

//   const isMobileWidth = viewportSize.width <= 767;
//   const columnCount = isMobileWidth ? mobileColumns : desktopColumns;
//   const gap = isCompact ? 8 : 12;
//   const baseRowHeight = isCompact ? 312 : 350;
//   const denseColumnsExtraHeight = columnCount >= 5 ? 36 : columnCount === 4 ? 20 : columnCount === 3 ? 12 : 0;
//   const mobileExtraHeight = isMobileWidth && columnCount >= 3 ? 18 : 0;
//   // rowHeight = высота карточки + gap (отступ снизу строки)
//   const rowHeight = baseRowHeight + denseColumnsExtraHeight + mobileExtraHeight + gap;
//   const gridWidth = Math.max(0, viewportSize.width);
//   const gridHeight = Math.max(260, viewportSize.height);
//   const rowCount = Math.max(1, Math.ceil(products.length / columnCount));

//   const onRowsRendered = useCallback(
//     (visibleRows: { startIndex: number; stopIndex: number }) => {
//       if (!hasMoreProducts || isLoadingMoreProducts || products.length === 0) {
//         return;
//       }

//       const threshold = Math.max(0, rowCount - 2);
//       if (visibleRows.stopIndex < threshold) {
//         return;
//       }

//       // Защита от повторной подгрузки - проверяем что индекс больше предыдущего
//       if (visibleRows.stopIndex <= lastLoadMoreRowRef.current) {
//         return;
//       }

//       lastLoadMoreRowRef.current = visibleRows.stopIndex;
      
//       // Сохраняем позицию скролла перед подгрузкой
//       scrollTopRef.current = viewportRef.current?.scrollTop || 0;
//       onLoadMoreProducts();
//     },
//     [hasMoreProducts, isLoadingMoreProducts, rowCount, products.length, onLoadMoreProducts]
//   );

//   type VirtualRowProps = {
//     products: Product[];
//     columnCount: number;
//     gap: number;
//     gridClassName: string;
//     favoriteSet: Set<number>;
//     qtyDrafts: Record<number, string>;
//     isListBusy: boolean;
//     onOpenPreview: (product: Product) => void;
//     onToggleFavorite: (productId: number) => void;
//     onEditProduct: (product: Product) => void;
//     onDeleteProduct: (product: Product) => void;
//     onQtyDraftChange: (productId: number, value: string) => void;
//     onAddToCurrentList: (product: Product, quantity: number) => void;
//   };

//   const Row = useCallback(
//     ({ index, style, ...rowProps }: RowComponentProps<VirtualRowProps>) => {
//       const start = index * rowProps.columnCount;
//       const rowProducts: Product[] = rowProps.products.slice(start, start + rowProps.columnCount);

//       return (
//         <div
//           style={{
//             ...style,
//             boxSizing: 'border-box',
//             paddingBottom: rowProps.gap,
//           }}
//         >
//           <div
//             className={rowProps.gridClassName}
//             style={{
//               display: 'grid',
//               gridTemplateColumns: `repeat(${rowProps.columnCount}, minmax(0, 1fr))`,
//               gap: `${rowProps.gap}px`,
//             }}
//           >
//             {rowProducts.map((product) => {
//               const qtyDraft = Object.prototype.hasOwnProperty.call(rowProps.qtyDrafts, product.id)
//                 ? rowProps.qtyDrafts[product.id]
//                 : '';

//               return (
//                 <ProductCard
//                   key={product.id}
//                   product={product}
//                   isFavorite={rowProps.favoriteSet.has(product.id)}
//                   qtyDraft={qtyDraft}
//                   isListBusy={rowProps.isListBusy}
//                   onOpenPreview={rowProps.onOpenPreview}
//                   onToggleFavorite={rowProps.onToggleFavorite}
//                   onEditProduct={rowProps.onEditProduct}
//                   onDeleteProduct={rowProps.onDeleteProduct}
//                   onQtyDraftChange={rowProps.onQtyDraftChange}
//                   onAddToCurrentList={rowProps.onAddToCurrentList}
//                 />
//               );
//             })}
//           </div>
//         </div>
//       );
//     },
//     []
//   );

//   const rowProps = useMemo(
//     () => ({
//       products,
//       columnCount,
//       gap,
//       gridClassName: `products-grid ${isCompact ? 'compact' : ''} ${isMobileWidth ? `mobile-cols-${columnCount}` : `desktop-cols-${columnCount}`}`.trim(),
//       favoriteSet,
//       qtyDrafts,
//       isListBusy,
//       onOpenPreview,
//       onToggleFavorite,
//       onEditProduct,
//       onDeleteProduct,
//       onQtyDraftChange,
//       onAddToCurrentList,
//     }),
//     [
//       products,
//       columnCount,
//       gap,
//       isCompact,
//       isMobileWidth,
//       favoriteSet,
//       qtyDrafts,
//       isListBusy,
//       onOpenPreview,
//       onToggleFavorite,
//       onEditProduct,
//       onDeleteProduct,
//       onQtyDraftChange,
//       onAddToCurrentList,
//     ]
//   );

  
//   return (
//     <div className="products-virtual-shell" ref={viewportRef}>
//       {gridWidth > 0 ? (
//         <List
//           style={{ width: gridWidth, height: gridHeight }}
//           rowComponent={Row}
//           rowCount={rowCount}
//           rowHeight={rowHeight}
//           rowProps={rowProps}
//           overscanCount={2}
//           onRowsRendered={onRowsRendered}
//         >
//           {isLoadingMoreProducts ? <div className="products-list-overlay" /> : null}
//         </List>
//       ) : null}
//     </div>
//   );
// }

function App() {
  const activeListId = useWorkspaceStore((state) => state.activeListId);
  const setActiveListId = useWorkspaceStore((state) => state.setActiveListId);
  const favoriteProductIds = useWorkspaceStore((state) => state.favoriteProductIds);
  const setFavoriteProductIds = useWorkspaceStore((state) => state.setFavoriteProductIds);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoadingAllProducts, setIsLoadingAllProducts] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [categories, setCategories] = useState<Category[]>([]);
  // const [products, setProducts] = useState<Product[]>([]);
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

  // const [isLoadingProducts, setIsLoadingProducts] = useState(false);
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
  const [showFrequentModal, setShowFrequentModal] = useState(false);
  const [productQtyDrafts, setProductQtyDrafts] = useState<Record<number, string>>({});

  const [catalogDesktopColumns, setCatalogDesktopColumns] = useState<1 | 2 | 3 | 4 | 5>(() => {
    const saved = Number(localStorage.getItem(CATALOG_DESKTOP_COLUMNS_KEY));
    return saved === 1 || saved === 2 || saved === 3 || saved === 4 || saved === 5 ? saved : 4;
  });
  const [catalogMobileColumns, setCatalogMobileColumns] = useState<1 | 2 | 3 | 4 | 5>(() => {
    const saved = Number(localStorage.getItem(CATALOG_MOBILE_COLUMNS_KEY));
    return saved === 1 || saved === 2 || saved === 3 || saved === 4 || saved === 5 ? saved : 2;
  });
  const [isCatalogCompact, setIsCatalogCompact] = useState(() => localStorage.getItem(CATALOG_COMPACT_KEY) === '1');
  const [isCatalogSettingsOpen, setIsCatalogSettingsOpen] = useState(false);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // const [hasMoreProducts, setHasMoreProducts] = useState(true);
  // const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  // const isProductsFetchPendingRef = useRef(false);
  // const pendingOffsetRef = useRef(0);
  const searchRef = useRef(search);
  // const lastSearchRef = useRef('');


  
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
  const debouncedSearch = useDebounce(search, 300);
  
  const {
    products,
    hasMoreProducts,
    isLoadingProducts,
    isLoadingMoreProducts,
    loadMoreProducts,
    refreshProducts,   // 👈 добавить
    removeProduct,
  } = useProducts({
    search: debouncedSearch,
    selectedCategoryId,
    showFavoritesOnly,
    favoriteProductIds,
  });

  // Синхронизируем searchRef с debouncedSearch для использования в loadProducts
  useEffect(() => {
    searchRef.current = debouncedSearch;
  }, [debouncedSearch]);

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

  const loadCategories = useCallback(async () => {
    const { getCategoriesTree } = await import('./db/dbService');
    const data = await getCategoriesTree();
    setCategories(data as unknown as Category[]);
  }, []);

  // const loadProducts = useCallback(async (mode: 'reset' | 'append' = 'reset') => {
  //   if (isProductsFetchPendingRef.current) {
  //     return;
  //   }

  //   // В режиме избранного не загружаем новые товары
  //   if (showFavoritesOnly) {
  //     return;
  //   }

  //   if (mode === 'append' && !hasMoreProducts) {
  //     return;
  //   }

  //   isProductsFetchPendingRef.current = true;
  //   if (mode === 'append') {
  //     setIsLoadingMoreProducts(true);
  //   } else {
  //     setIsLoadingProducts(true);
  //   }

  //   try {
  //     const currentOffset = mode === 'append' ? pendingOffsetRef.current : 0;
  //     const params: Record<string, string | number> = {
  //       limit: PRODUCTS_PAGE_SIZE,
  //       offset: currentOffset,
  //     };
  //     // При включенном избранном поиск не используется
  //     const currentSearch = showFavoritesOnly ? '' : searchRef.current.trim();
  //     if (currentSearch) {
  //       params.search = currentSearch;
  //     }
  //     if (selectedCategoryId && !currentSearch) {
  //       params.category_id = selectedCategoryId;
  //     }

  //     const data = await apiRequest<{ items: Product[]; hasMore: boolean }>({ url: '/products', params });

  //     if (mode === 'append') {
  //       setProducts((prev) => [...prev, ...data.items]);
  //       pendingOffsetRef.current = currentOffset + data.items.length;
  //       // Сбрасываем ref чтобы разрешить следующую подгрузку
  //       lastLoadMoreRowRef.current = -1;
  //     } else {
  //       setProducts(data.items);
  //       pendingOffsetRef.current = data.items.length;
  //     }

  //     setHasMoreProducts(data.hasMore);
  //   } catch {
  //     toast.error('Не удалось загрузить товары');
  //   } finally {
  //     isProductsFetchPendingRef.current = false;
  //     setIsLoadingProducts(false);
  //     setIsLoadingMoreProducts(false);
  //   }
  // }, [apiRequest, selectedCategoryId, hasMoreProducts, showFavoritesOnly]);

  // const loadMoreProducts = useCallback(() => {
  //   void loadProducts('append');
  // }, [loadProducts]);

  const loadLists = useCallback(
    async (status: 'active' | 'completed') => {
      const { getShoppingLists } = await import('./db/dbService');
      const data = await getShoppingLists(status);
      return data.map((r) => ({
        id: r.id!,
        session_id: '',
        name: r.name,
        status: r.status,
        completed_at: r.completed_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })) as ShoppingList[];
    },
    []
  );

  const loadItemsForList = useCallback(
    async (listId: number) => {
      const { getListItems, getProducts } = await import('./db/dbService');
      const records = await getListItems(listId);
      const allProducts = await getProducts({ limit: 10000, offset: 0 });
      const productsMap = new Map<number, Product>();
      for (const p of allProducts.items) {
        productsMap.set(p.id!, {
          id: p.id!,
          name: p.name,
          price: p.price,
          unit: p.unit,
          image_url: p.image_url,
          category_id: p.category_id ?? 0,
          is_custom: p.is_custom,
          created_at: p.created_at,
        });
      }

      const items: ListItem[] = records.map((r) => {
        const product = productsMap.get(r.product_id) || {
          id: r.product_id,
          name: 'Товар удалён',
          price: null,
          unit: 'шт',
          image_url: null,
          category_id: 0,
          is_custom: false,
          created_at: '',
        };
        return {
          id: r.id!,
          list_id: r.list_id,
          product_id: r.product_id,
          quantity: r.quantity,
          note: r.note,
          product,
        };
      });
      setListItems(items);
    },
    []
  );

  const refreshFavorites = useCallback(async () => {
    const { getFavorites } = await import('./db/dbService');
    const data = await getFavorites();
    setFavoriteProductIds(data);
  }, [setFavoriteProductIds]);

  const refreshLists = useCallback(async () => {
    try {
      const [active, completed] = await Promise.all([loadLists('active'), loadLists('completed')]);
      let nextActive = active;

      if (nextActive.length === 0) {
        const { createShoppingList } = await import('./db/dbService');
        const created = await createShoppingList('Основной');
        nextActive = [{
          id: created.id!,
          session_id: '',
          name: created.name,
          status: created.status,
          completed_at: created.completed_at,
          created_at: created.created_at,
          updated_at: created.updated_at,
        }];
      }

      setActiveLists(nextActive);
      setHistoryLists(completed);

      if (!activeListId || !nextActive.some((list: ShoppingList) => list.id === activeListId)) {
        setActiveListId(nextActive[0].id);
      }
    } catch {
      toast.error('Не удалось загрузить списки');
    }
  }, [loadLists, activeListId, setActiveListId]);

  // Учёт частоты использования товара
  const incrementUsage = useCallback((productId: number) => {
    const key = 'santex_product_usage';
    const raw = localStorage.getItem(key);
    const usage = raw ? JSON.parse(raw) : {};
    usage[productId] = (usage[productId] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(usage));
  }, []);

  const getFrequentProducts = useCallback(() => {
    const key = 'santex_product_usage';
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const usage = JSON.parse(raw);
    const sorted = Object.entries(usage)
      .map(([id, count]) => ({ id: Number(id), count: Number(count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const productsList = sorted
      .map(entry => allProducts.find(p => p.id === entry.id))
      .filter(Boolean) as Product[];
    return productsList;
  }, [allProducts]);

  // Загрузка всех продуктов для функции "Часто используемые"
  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setIsLoadingAllProducts(true);
      try {
        const { db } = await import('./db/database');
        const records = await db.products.orderBy('created_at').reverse().toArray();
        if (!cancelled) {
          setAllProducts(records.map((r) => ({
            id: r.id!,
            name: r.name,
            price: r.price,
            unit: r.unit,
            image_url: r.image_url,
            category_id: r.category_id ?? 0,
            is_custom: r.is_custom,
            created_at: r.created_at,
          })));
        }
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setIsLoadingAllProducts(false);
      }
    };
    void loadAll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(CATALOG_DESKTOP_COLUMNS_KEY, String(catalogDesktopColumns));
  }, [catalogDesktopColumns]);

  useEffect(() => {
    localStorage.setItem(CATALOG_MOBILE_COLUMNS_KEY, String(catalogMobileColumns));
  }, [catalogMobileColumns]);

  useEffect(() => {
    localStorage.setItem(CATALOG_COMPACT_KEY, isCatalogCompact ? '1' : '0');
  }, [isCatalogCompact]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expandedCategoryIds));
  }, [expandedCategoryIds]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // Сбрасываем offset и lastLoadMoreRowRef при смене категории или режима избранного
  // useEffect(() => {
  //   setHasMoreProducts(true);
  //   pendingOffsetRef.current = 0;
  //   lastLoadMoreRowRef.current = -1;
  // }, [selectedCategoryId, showFavoritesOnly]);

  // Загружаем продукты при изменении поиска (без сброса offset)
  // useEffect(() => {
  //   // Предотвращаем дублирующие запросы
  //   if (lastSearchRef.current === debouncedSearch) {
  //     return;
  //   }
  //   lastSearchRef.current = debouncedSearch;
    
  //   if (debouncedSearch) {
  //     pendingOffsetRef.current = 0;
  //     setHasMoreProducts(true);
  //   }
  //   void loadProducts();
  // }, [loadProducts, debouncedSearch]);

  // Загружаем продукты при смене категории
  // useEffect(() => {
  //   lastLoadMoreRowRef.current = -1;
  //   void loadProducts();
  // }, [loadProducts, selectedCategoryId]);

  useEffect(() => {
    void refreshLists();
    void refreshFavorites();
  }, []);

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
        const { addListItem } = await import('./db/dbService');
        const parsed = JSON.parse(legacyRaw) as Record<string, { product?: Product; qty?: number }>;
        const values = Object.values(parsed).filter((item) => item.product?.id && item.qty && item.qty > 0);

        for (const item of values) {
          await addListItem(activeListId, item.product!.id, item.qty!, null);
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
  }, [activeListId, loadItemsForList]);

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
      price: product.price === null ? '' : String(product.price),
      unit: product.unit,
      categoryId: String(product.category_id),
      newCategoryName: '',
      newCategoryParentId: '',
      imageFile: null,
      imageUrl: product.image_url || '',
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
        const { addListItem } = await import('./db/dbService');
        await addListItem(activeListId, product.id, quantity, note);
        await loadItemsForList(activeListId);
        incrementUsage(product.id);
        toast.success('Товар добавлен в список');
      } catch {
        toast.error('Не удалось добавить товар');
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, loadItemsForList, incrementUsage]
  );

  const updateListItem = useCallback(
    async (itemId: number, payload: { quantity?: number; note?: string | null }) => {
      if (!activeListId) {
        return;
      }

      const { updateListItem: updateListItemDb } = await import('./db/dbService');
      await updateListItemDb(itemId, activeListId, payload);
      await loadItemsForList(activeListId);
    },
    [activeListId, loadItemsForList]
  );

  const deleteListItem = useCallback(
    async (itemId: number) => {
      if (!activeListId) {
        return;
      }

      const { deleteListItem: deleteListItemDb } = await import('./db/dbService');
      await deleteListItemDb(itemId, activeListId);
      await loadItemsForList(activeListId);
    },
    [activeListId, loadItemsForList]
  );

  const toggleFavorite = useCallback(
    async (productId: number) => {
      const isFavorite = favoriteSet.has(productId);
      try {
        const { addFavorite, removeFavorite } = await import('./db/dbService');
        if (isFavorite) {
          await removeFavorite(productId);
          setFavoriteProductIds(favoriteProductIds.filter((id) => id !== productId));
        } else {
          await addFavorite(productId);
          setFavoriteProductIds([...favoriteProductIds, productId]);
        }
      } catch {
        toast.error('Не удалось обновить избранное');
      }
    },
    [favoriteSet, favoriteProductIds, setFavoriteProductIds]
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
      const { updateShoppingList } = await import('./db/dbService');
      await updateShoppingList(activeList.id, nextName);
      await refreshLists();
      toast.success('Список переименован');
    } catch {
      toast.error('Не удалось переименовать список');
    }
  }, [activeList, refreshLists, openPromptDialog]);

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
      const { createShoppingList } = await import('./db/dbService');
      const created = await createShoppingList(name);
      await refreshLists();
      setActiveListId(created.id!);
      toast.success('Новый список создан');
    } catch {
      toast.error('Не удалось создать список');
    }
  }, [refreshLists, setActiveListId, openPromptDialog]);

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
      const { deleteShoppingList } = await import('./db/dbService');
      await deleteShoppingList(activeList.id);
      await refreshLists();
      toast.success('Список удалён');
    } catch {
      toast.error('Не удалось удалить список');
    }
  }, [activeList, refreshLists, openConfirmDialog]);

  const completeCurrentList = useCallback(async () => {
    if (!activeListId) {
      return;
    }

    try {
      const { completeShoppingList } = await import('./db/dbService');
      const data = await completeShoppingList(activeListId);
      setActiveListId(data.activeList.id!);
      await refreshLists();
      setDrawerTab('history');
      toast.success('Список завершён и перенесён в историю');
    } catch {
      toast.error('Не удалось завершить список');
    }
  }, [activeListId, refreshLists, setActiveListId]);

  const restoreFromHistory = useCallback(
    async (listId: number) => {
      try {
        const { restoreShoppingList } = await import('./db/dbService');
        const data = await restoreShoppingList(listId);
        setActiveListId(data.list.id!);
        setListItems(data.items.map((r) => ({
          id: r.id!,
          list_id: r.list_id,
          product_id: r.product_id,
          quantity: r.quantity,
          note: r.note,
          product: {
            id: r.product_id,
            name: 'Загрузка...',
            price: null,
            unit: 'шт',
            image_url: null,
            category_id: 0,
            is_custom: false,
            created_at: '',
          },
        })));
        setDrawerTab('list');
        await refreshLists();
        toast.success('Заказ восстановлен в новый список');
      } catch {
        toast.error('Не удалось восстановить заказ');
      }
    },
    [refreshLists, setActiveListId]
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
      const { deleteListItem: deleteListItemDb } = await import('./db/dbService');
      await Promise.all(
        listItems.map((item) => deleteListItemDb(item.id, activeListId))
      );
      setListItems([]);
      toast.success('Список очищен');
    } catch {
      toast.error('Не удалось очистить список');
    }
  }, [activeListId, listItems, openConfirmDialog]);

  const exportCartToTxt = useCallback(async () => {
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
        const noteValue = normalizeOptionalText(item.note);
        const notePart = noteValue ? ` (${noteValue})` : '';

        return [
          `${item.product.name}${notePart}`,
          `Кол-во: ${formatQuantity(item.quantity)} ${item.product.unit}`,
        ]
          .filter(Boolean)
          .join(' | ');
      }),
      '',
      `Позиции: ${listItems.length}`,
    ];

    const text = lines.join('\n');
    const fileName = `${activeList?.name || 'santex-list'}.txt`;

    // На мобильных устройствах предложить поделиться
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        await navigator.share({
          title: 'Список покупок',
          text: text,
        });
        toast.success('Текст готов к вставке');
        return;
      } catch (shareError) {
        // Если пользователь отменил или share не удался — идём дальше
        console.log('Share отменён', shareError);
      }
    }

    // Запасной вариант: скачать файл
    const blob = new Blob([text], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Файл сохранён. Откройте его из папки Загрузки');
  }, [listItems, activeList]);

  const handleImportJson = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setIsImportingJson(true);
      try {
        const result = await importPwaExport(file);
        toast.success(`Импорт завершён: ${result.products} товаров, ${result.categories} категорий`);
        // Перезагружаем данные
        await loadCategories();
        const { db } = await import('./db/database');
        const records = await db.products.orderBy('created_at').reverse().toArray();
        setAllProducts(records.map((r) => ({
          id: r.id!,
          name: r.name,
          price: r.price,
          unit: r.unit,
          image_url: r.image_url,
          category_id: r.category_id ?? 0,
          is_custom: r.is_custom,
          created_at: r.created_at,
        })));
      } catch (error) {
        console.error('Import error:', error);
        toast.error(error instanceof Error ? error.message : 'Ошибка импорта');
      } finally {
        setIsImportingJson(false);
      }
    };
    input.click();
  }, [loadCategories, setAllProducts]);

  const handleDeleteAllProducts = useCallback(async () => {
    const confirmed = await openConfirmDialog({
      title: 'Удалить все товары',
      description: 'Это действие удалит все товары, позиции списков и избранное. Продолжить?',
      confirmText: 'Удалить всё',
      tone: 'danger',
    });
    if (!confirmed) return;

    setIsDeletingAll(true);
    try {
      const { deleteAllProducts } = await import('./db/dbService');
      await deleteAllProducts();
      setAllProducts([]);
      setListItems([]);
      setFavoriteProductIds([]);
      toast.success('Все товары удалены');
    } catch {
      toast.error('Не удалось удалить товары');
    } finally {
      setIsDeletingAll(false);
    }
  }, [openConfirmDialog]);

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
          const { createCategory } = await import('./db/dbService');
          const createdCategory = await createCategory(
            productForm.newCategoryName.trim(),
            productForm.newCategoryParentId ? Number(productForm.newCategoryParentId) : null
          );
          categoryId = String(createdCategory.id);
          await loadCategories();
        }

        if (!categoryId) {
          toast.error('Выберите категорию');
          return;
        }

        let imageUrl: string | null = null;
        if (productForm.imageFile) {
          imageUrl = await readFileAsDataURL(productForm.imageFile);
        } else if (productForm.imageUrl.trim()) {
          imageUrl = productForm.imageUrl.trim();
        }

        const productData = {
          name: productForm.name.trim(),
          sku: null as string | null,
          price: productForm.price.trim() ? Number(productForm.price) : null,
          unit: productForm.unit.trim() || 'шт',
          image_url: imageUrl,
          category_id: Number(categoryId),
          is_custom: !editingProduct,
        };

        if (editingProduct) {
          const { updateProduct } = await import('./db/dbService');
          await updateProduct(editingProduct.id, productData);
          toast.success('Товар обновлён');
        } else {
          const { createProduct } = await import('./db/dbService');
          await createProduct(productData);
          toast.success('Товар добавлен');
        }

        closeProductModal();
        await refreshProducts();
      } catch {
        toast.error('Не удалось сохранить товар');
      }
    },
    [productForm, editingProduct, loadCategories, closeProductModal, refreshProducts]
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
        const { deleteProduct: deleteProductDb } = await import('./db/dbService');
        await deleteProductDb(product.id);
        removeProduct(product.id);
        setListItems((prev) => prev.filter((item) => item.product_id !== product.id));
        setFavoriteProductIds(favoriteProductIds.filter((id) => id !== product.id));
        toast.success('Товар удалён');
      } catch {
        toast.error('Ошибка удаления');
      }
    },
    [favoriteProductIds, setFavoriteProductIds, openConfirmDialog]
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
          const { updateCategory } = await import('./db/dbService');
          await updateCategory(
            categoryForm.id,
            categoryForm.name.trim(),
            categoryForm.parentId ? Number(categoryForm.parentId) : null
          );
          toast.success('Категория обновлена');
        } else {
          const { createCategory } = await import('./db/dbService');
          await createCategory(
            categoryForm.name.trim(),
            categoryForm.parentId ? Number(categoryForm.parentId) : null
          );
          toast.success('Категория создана');
        }

        setIsCategoryModalOpen(false);
        await loadCategories();
      } catch {
        toast.error('Не удалось сохранить категорию');
      }
    },
    [categoryForm, loadCategories]
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
        const { deleteCategory: deleteCategoryDb } = await import('./db/dbService');
        await deleteCategoryDb(category.id);
        toast.success('Категория удалена');
        if (selectedCategoryId === category.id) {
          setSelectedCategoryId(null);
        }
        await Promise.all([loadCategories(), refreshProducts()]);
      } catch {
        toast.error('Не удалось удалить категорию');
      }
    },
    [selectedCategoryId, loadCategories, refreshProducts, openConfirmDialog]
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
        } else if (isCatalogSettingsOpen) {
          setIsCatalogSettingsOpen(false);
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

  const isAnyModalOpen = useMemo(() => {
    return isCartOpen ||
           previewProduct !== null ||
           isProductModalOpen ||
           isCategoryModalOpen ||
           isCatalogSettingsOpen ||
           isCategorySheetOpen ||
           showFrequentModal ||
           confirmDialog.isOpen ||
           promptDialog.isOpen ||
           showFavoritesOnly;
  }, [
    isCartOpen,
    previewProduct,
    isProductModalOpen,
    isCategoryModalOpen,
    isCatalogSettingsOpen,
    isCategorySheetOpen,
    showFrequentModal,
    confirmDialog.isOpen,
    promptDialog.isOpen,
    showFavoritesOnly,
  ]);

  const pushModalState = useCallback(() => {
    if (!isAnyModalOpen) return;
    window.history.pushState({ modalOpen: true }, '');
  }, [isAnyModalOpen]);

  useEffect(() => {
    if (isAnyModalOpen) {
      pushModalState();
    }
  }, [isAnyModalOpen, pushModalState]);

  useEffect(() => {
    const handlePopState = () => {
      if (isCartOpen) setIsCartOpen(false);
      if (previewProduct) setPreviewProduct(null);
      if (isProductModalOpen) closeProductModal();
      if (isCategoryModalOpen) setIsCategoryModalOpen(false);
      if (isCatalogSettingsOpen) setIsCatalogSettingsOpen(false);
      if (isCategorySheetOpen) setIsCategorySheetOpen(false);
      if (showFrequentModal) setShowFrequentModal(false);
      if (confirmDialog.isOpen) closeConfirmDialog(false);
      if (promptDialog.isOpen) closePromptDialog(null);
      if (showFavoritesOnly) setShowFavoritesOnly(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    isCartOpen,
    previewProduct,
    isProductModalOpen,
    isCategoryModalOpen,
    isCatalogSettingsOpen,
    isCategorySheetOpen,
    showFrequentModal,
    confirmDialog.isOpen,
    promptDialog.isOpen,
    showFavoritesOnly,
    closeProductModal,
    closeConfirmDialog,
    closePromptDialog,
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
        <div className="topbar-row">
          <button className="icon-btn mobile-only" onClick={() => setIsCategorySheetOpen(true)} type="button">
            <FiMenu />
          </button>
          <div className="brand">Сантехнический помощник</div>
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
            <button
              className="btn btn-soft"
              type="button"
              onClick={() => setShowFrequentModal(true)}
              aria-label="Часто используемые товары"
            >
              <FiTrendingUp />
              <span>Часто</span>
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
        </div>
        <div className="search-wrap">
          <FiSearch className="search-icon" />
          <input
            id="product-search"
            name="search"
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="search-input"
            placeholder="Поиск по названию"
            autoComplete="off"
            aria-label="Поиск товаров"
          />
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
            <div className="content-top-actions">
              <div className="products-count">
                {visibleProducts.length} шт. {showFavoritesOnly ? '• только избранное' : ''}
              </div>
              <button className="btn btn-soft" type="button" onClick={() => setIsCatalogSettingsOpen(true)}>
                <FiSliders />
                <span>Вид каталога</span>
              </button>
            </div>
          </div>

          {isLoadingProducts && products.length === 0 ? <div className="state-box">Загрузка...</div> : null}
          {!isLoadingProducts && visibleProducts.length === 0 ? (
            <div className="state-box">По вашему запросу ничего не найдено</div>
          ) : null}

          {!isLoadingProducts && visibleProducts.length > 0 ? (
            <VirtualProductsGrid
              products={visibleProducts}
              favoriteSet={favoriteSet}
              qtyDrafts={productQtyDrafts}
              isListBusy={isListBusy}
              isCompact={isCatalogCompact}
              desktopColumns={catalogDesktopColumns}
              mobileColumns={catalogMobileColumns}
              hasMoreProducts={hasMoreProducts}
              isLoadingMoreProducts={isLoadingMoreProducts}
              onLoadMoreProducts={loadMoreProducts}
              onOpenPreview={openPreview}
              onToggleFavorite={toggleFavorite}
              onEditProduct={openEditProductModal}
              onDeleteProduct={deleteProduct}
              onQtyDraftChange={(productId, value) =>
                setProductQtyDrafts((prev) => ({
                  ...prev,
                  [productId]: value,
                }))
              }
              onAddToCurrentList={addToCurrentList}
              showFavoritesOnly={showFavoritesOnly}
            />
          ) : null}
          {isLoadingMoreProducts ? <div className="products-load-state">Загрузка ещё товаров...</div> : null}
        </section>
      </main>

      <button className="fab mobile-only" onClick={() => setIsCartOpen(true)} type="button">
        <FiShoppingCart />
        <span>{formatQuantity(cartCount)}</span>
      </button>

      <div className={`drawer-overlay ${isCartOpen ? 'visible' : ''}`} onClick={() => setIsCartOpen(false)} />
      <aside className={`cart-drawer ${isCartOpen ? 'open' : ''}`}>
        <div className="panel-header" style={{ margin: `${15}px` }}>
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
                Изображение (файл)
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
              <label className="full-row">
                Изображение (URL)
                <input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={productForm.imageUrl || ''}
                  onChange={(event) => {
                    const url = event.target.value;
                    setProductForm((prev) => ({ ...prev, imageUrl: url }));
                    if (url.trim()) {
                      setImagePreview(url.trim());
                    }
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

      {isCatalogSettingsOpen ? (
        <div className="modal-overlay" onClick={() => setIsCatalogSettingsOpen(false)}>
          <div className="modal compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h3>Настройки каталога</h3>
              <button className="icon-btn ghost" type="button" onClick={() => setIsCatalogSettingsOpen(false)}>
                <FiX />
              </button>
            </div>

            <div className="settings-block">
              <h4 className="settings-title">Колонки на десктопе</h4>
              <div className="settings-options">
                {[1, 2, 3, 4, 5].map((cols) => (
                  <button
                    key={cols}
                    className={`btn btn-soft ${catalogDesktopColumns === cols ? 'active-filter' : ''}`}
                    type="button"
                    onClick={() => setCatalogDesktopColumns(cols as 1 | 2 | 3 | 4 | 5)}
                  >
                    {cols}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-block">
              <h4 className="settings-title">Колонки на мобильном</h4>
              <div className="settings-options">
                {[1, 2, 3, 4, 5].map((cols) => (
                  <button
                    key={cols}
                    className={`btn btn-soft ${catalogMobileColumns === cols ? 'active-filter' : ''}`}
                    type="button"
                    onClick={() => setCatalogMobileColumns(cols as 1 | 2 | 3 | 4 | 5)}
                  >
                    {cols}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-toggle">
              <span className="settings-hint">Компактный режим</span>
              <button
                className={`btn btn-soft ${isCatalogCompact ? 'active-filter' : ''}`}
                type="button"
                onClick={() => setIsCatalogCompact((prev) => !prev)}
              >
                {isCatalogCompact ? 'Вкл' : 'Выкл'}
              </button>
            </div>

            <div className="settings-block">
              <h4 className="settings-title">Импорт каталога</h4>
              <p className="settings-hint" style={{ marginBottom: '8px' }}>
                Загрузите JSON-файл экспорта (pwa-export.json) для добавления товаров и категорий
              </p>
              <button
                className="btn btn-primary"
                type="button"
                disabled={isImportingJson}
                onClick={handleImportJson}
              >
                <FiUpload /> {isImportingJson ? 'Импорт...' : 'Импорт каталога'}
              </button>
            </div>

            <div className="settings-block">
              <h4 className="settings-title">Удаление данных</h4>
              <p className="settings-hint" style={{ marginBottom: '8px' }}>
                Удалить все товары, позиции списков и избранное
              </p>
              <button
                className="btn btn-danger"
                type="button"
                disabled={isDeletingAll}
                onClick={handleDeleteAllProducts}
              >
                <FiTrash2 /> {isDeletingAll ? 'Удаление...' : 'Удалить все товары'}
              </button>
            </div>
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

      {showFrequentModal && (
        <div className="modal-overlay" onClick={() => setShowFrequentModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <h3>Часто используемые товары</h3>
              <button className="icon-btn ghost" onClick={() => setShowFrequentModal(false)}>
                <FiX />
              </button>
            </div>
            {isLoadingAllProducts ? (
              <div className="state-box">Загрузка...</div>
            ) : getFrequentProducts().length === 0 ? (
              <div className="state-box">
                Нет часто используемых товаров. Добавляйте товары в корзину, и они появятся здесь.
              </div>
            ) : (
              <div className="frequent-products-grid">
                {getFrequentProducts().map(product => (
                  <div key={product.id} className="frequent-product-card">
                    <img src={getImageUrl(product.image_url)} alt={product.name} />
                    <div className="frequent-product-info">
                      <div className="frequent-product-name">{product.name}</div>
                    </div>
                    <button
                      className="button button-primary"
                      onClick={() => {
                        addToCurrentList(product, 1);
                        setShowFrequentModal(false);
                      }}
                    >
                      <FiPlus />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

