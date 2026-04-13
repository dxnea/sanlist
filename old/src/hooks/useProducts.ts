import { useCallback, useEffect, useRef, useState } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';
import type { Product, ProductsResponse } from '../types';
import { handleApiError } from '../utils/apiError';

const PRODUCTS_PAGE_SIZE = 120;

interface UseProductsOptions {
  apiBase: string;
  sessionId: string;
  search: string;
  selectedCategoryId: number | null;
  showFavoritesOnly: boolean;
  favoriteProductIds: number[];
}

export function useProducts(options: UseProductsOptions) {
  const { apiBase, sessionId, search, selectedCategoryId, showFavoritesOnly, favoriteProductIds } = options;

  const [products, setProducts] = useState<Product[]>([]);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);

  const isProductsFetchPendingRef = useRef(false);
  const pendingOffsetRef = useRef(0);
  const hasMoreRef = useRef(hasMoreProducts);
  const lastRequestKeyRef = useRef('');

  useEffect(() => {
    hasMoreRef.current = hasMoreProducts;
  }, [hasMoreProducts]);

  const apiRequest = useCallback(
    async <T,>(config: AxiosRequestConfig): Promise<T> => {
      const url = `${apiBase}${config.url}`;
      const response = await axios.get(url, {
        ...config,
        headers: {
          'X-Session-ID': sessionId,
          ...(config.headers || {}),
        },
      });
      return response.data;
    },
    [apiBase, sessionId]
  );

  const loadProducts = useCallback(
    async (mode: 'reset' | 'append' = 'reset') => {
      // В режиме избранного не загружаем с сервера
      if (showFavoritesOnly) {
        return;
      }

      if (isProductsFetchPendingRef.current) return;
      if (mode === 'append' && !hasMoreRef.current) return;

      const requestKey = `${mode}:${search}:${selectedCategoryId}:${showFavoritesOnly}`;
      if (mode === 'reset' && lastRequestKeyRef.current === requestKey) return;
      lastRequestKeyRef.current = requestKey;

      isProductsFetchPendingRef.current = true;
      if (mode === 'append') {
        setIsLoadingMoreProducts(true);
      } else {
        setIsLoadingProducts(true);
      }

      try {
        const currentOffset = mode === 'append' ? pendingOffsetRef.current : 0;
        const params: Record<string, string | number> = {
          limit: PRODUCTS_PAGE_SIZE,
          offset: currentOffset,
        };
        if (search.trim()) {
          params.search = search.trim();
        }
        if (selectedCategoryId && !search.trim()) {
          params.category_id = selectedCategoryId;
        }

        const data = await apiRequest<ProductsResponse>({ url: '/products', params });

        if (mode === 'append') {
          setProducts((prev) => [...prev, ...data.items]);
          pendingOffsetRef.current = currentOffset + data.items.length;
        } else {
          setProducts(data.items);
          pendingOffsetRef.current = data.items.length;
        }

        setHasMoreProducts(data.hasMore);
      } catch (error) {
        console.error('Failed to load products:', handleApiError(error));
      } finally {
        isProductsFetchPendingRef.current = false;
        setIsLoadingProducts(false);
        setIsLoadingMoreProducts(false);
      }
    },
    [apiRequest, search, selectedCategoryId, showFavoritesOnly]
  );

  const loadMoreProducts = useCallback(() => {
    if (showFavoritesOnly) return;
    void loadProducts('append');
  }, [loadProducts, showFavoritesOnly]);

  const refreshProducts = useCallback(() => {
    if (showFavoritesOnly) return;
    void loadProducts('reset');
  }, [loadProducts, showFavoritesOnly]);

  const removeProduct = useCallback((productId: number) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  }, []);

  // Сброс offset при изменении фильтров
  useEffect(() => {
    if (showFavoritesOnly) {
      setHasMoreProducts(false);
    } else {
      setHasMoreProducts(true);
    }
    pendingOffsetRef.current = 0;
  }, [search, selectedCategoryId, showFavoritesOnly]);

  // Загрузка товаров только когда избранное выключено
  useEffect(() => {
    if (!showFavoritesOnly) {
      void loadProducts('reset');
    }
  }, [loadProducts, search, selectedCategoryId, showFavoritesOnly]);

  const visibleProducts = showFavoritesOnly
    ? products.filter((product) => favoriteProductIds.includes(product.id))
    : products;

  return {
    products: visibleProducts,
    allProducts: products,
    hasMoreProducts: showFavoritesOnly ? false : hasMoreProducts,
    isLoadingProducts: showFavoritesOnly ? false : isLoadingProducts,
    isLoadingMoreProducts: showFavoritesOnly ? false : isLoadingMoreProducts,
    loadMoreProducts,
    refreshProducts,
    removeProduct,
    setProducts,
  };
}