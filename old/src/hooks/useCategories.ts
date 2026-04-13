import { useCallback, useEffect, useState } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';
import type { Category } from '../types';
import { handleApiError } from '../utils/apiError';

interface UseCategoriesOptions {
  apiBase: string;
  sessionId: string;
}

export function useCategories(options: UseCategoriesOptions) {
  const { apiBase, sessionId } = options;

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

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

  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    try {
      const data = await apiRequest<Category[]>({ url: '/categories' });
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', handleApiError(error));
    } finally {
      setIsLoadingCategories(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const addCategory = useCallback(
    async (name: string, parentId: number | null) => {
      try {
        const newCategory = await apiRequest<Category>({
          url: '/categories',
          method: 'POST',
          data: { name, parent_id: parentId },
        });
        await loadCategories();
        return newCategory;
      } catch (error) {
        console.error('Failed to add category:', handleApiError(error));
        throw error;
      }
    },
    [apiRequest, loadCategories]
  );

  const updateCategory = useCallback(
    async (id: number, name: string, parentId: number | null) => {
      try {
        await apiRequest<Category>({
          url: `/categories/${id}`,
          method: 'PUT',
          data: { name, parent_id: parentId },
        });
        await loadCategories();
      } catch (error) {
        console.error('Failed to update category:', handleApiError(error));
        throw error;
      }
    },
    [apiRequest, loadCategories]
  );

  const deleteCategory = useCallback(
    async (id: number) => {
      try {
        await apiRequest({
          url: `/categories/${id}`,
          method: 'DELETE',
        });
        await loadCategories();
      } catch (error) {
        console.error('Failed to delete category:', handleApiError(error));
        throw error;
      }
    },
    [apiRequest, loadCategories]
  );

  return {
    categories,
    isLoadingCategories,
    addCategory,
    updateCategory,
    deleteCategory,
  };
}

export function flattenCategories(tree: Category[]): Category[] {
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
