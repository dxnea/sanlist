import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { Product } from '../types';
import { handleApiError } from '../utils/apiError';

const API_BASE = '/api';

export function useAllProducts(sessionId: string) {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadAllProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      let offset = 0;
      const limit = 500; // можно 500, но бэкенд ограничивает 500 максимум
      let allItems: Product[] = [];
      let hasMore = true;

      while (hasMore) {
        const response = await axios.get(`${API_BASE}/products`, {
          headers: { 'X-Session-ID': sessionId },
          params: { limit, offset }
        });
        const data = response.data;
        allItems = allItems.concat(data.items);
        hasMore = data.hasMore;
        offset += data.items.length;
      }
      setAllProducts(allItems);
    } catch (error) {
      console.error('Failed to load all products:', handleApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadAllProducts();
  }, [loadAllProducts]);

  return { allProducts, isLoadingAllProducts: isLoading, reloadAllProducts: loadAllProducts };
}