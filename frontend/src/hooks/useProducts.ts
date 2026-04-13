import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '../types';
import { getProducts, type ProductsQuery } from '../db/dbService';
import type { ProductRecord } from '../db/database';

const PRODUCTS_PAGE_SIZE = 120;

function normalizeProduct(record: ProductRecord): Product {
  return {
    id: record.id!,
    name: record.name,
    price: record.price,
    unit: record.unit,
    image_url: record.image_url,
    category_id: record.category_id ?? 0,
    is_custom: record.is_custom,
    created_at: record.created_at,
  };
}

interface UseProductsOptions {
  apiBase?: string;
  sessionId?: string;
  search: string;
  selectedCategoryId: number | null;
  showFavoritesOnly: boolean;
  favoriteProductIds: number[];
}

export function useProducts(options: UseProductsOptions) {
  const { search, selectedCategoryId, showFavoritesOnly, favoriteProductIds } = options;

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

  const loadProducts = useCallback(
    async (mode: 'reset' | 'append' = 'reset') => {
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
        const query: ProductsQuery = {
          search: search.trim() || undefined,
          categoryId: selectedCategoryId && !search.trim() ? selectedCategoryId : null,
          limit: PRODUCTS_PAGE_SIZE,
          offset: currentOffset,
        };

        const data = await getProducts(query);

        if (mode === 'append') {
          setProducts((prev) => [...prev, ...data.items.map(normalizeProduct)]);
          pendingOffsetRef.current = currentOffset + data.items.length;
        } else {
          setProducts(data.items.map(normalizeProduct));
          pendingOffsetRef.current = data.items.length;
        }

        setHasMoreProducts(data.hasMore);
      } catch (error) {
        console.error('Failed to load products:', error);
      } finally {
        isProductsFetchPendingRef.current = false;
        setIsLoadingProducts(false);
        setIsLoadingMoreProducts(false);
      }
    },
    [search, selectedCategoryId, showFavoritesOnly]
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

  useEffect(() => {
    if (showFavoritesOnly) {
      setHasMoreProducts(false);
    } else {
      setHasMoreProducts(true);
    }
    pendingOffsetRef.current = 0;
  }, [search, selectedCategoryId, showFavoritesOnly]);

  useEffect(() => {
    if (!showFavoritesOnly) {
      void loadProducts('reset');
    } else {
      setProducts([]);
    }
  }, [loadProducts, search, selectedCategoryId, showFavoritesOnly]);

  const visibleProducts = showFavoritesOnly
    ? products.filter((product) => favoriteProductIds.includes(product.id))
    : products;

  return {
    products: visibleProducts,
    hasMoreProducts: showFavoritesOnly ? false : hasMoreProducts,
    isLoadingProducts: showFavoritesOnly ? false : isLoadingProducts,
    isLoadingMoreProducts: showFavoritesOnly ? false : isLoadingMoreProducts,
    loadMoreProducts,
    refreshProducts,
    removeProduct,
    setProducts,
  };
}