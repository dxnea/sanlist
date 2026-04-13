import { useCallback, useEffect, useState } from 'react';
import type { Category } from '../types';
import { getCategoriesTree, createCategory, updateCategory, deleteCategory } from '../db/dbService';
import type { CategoryTreeRecord } from '../db/dbService';

interface UseCategoriesOptions {
  apiBase: string;
  sessionId: string;
}

function normalizeCategory(record: CategoryTreeRecord): Category {
  return {
    id: record.id!,
    name: record.name,
    parent_id: record.parent_id,
    children: record.children.map(normalizeCategory),
  };
}

export function useCategories(_options: UseCategoriesOptions) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    try {
      const data = await getCategoriesTree();
      setCategories(data.map(normalizeCategory));
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const addCategory = useCallback(
    async (name: string, parentId: number | null) => {
      await createCategory(name, parentId);
      await loadCategories();
    },
    [loadCategories]
  );

  const updateCategoryFn = useCallback(
    async (id: number, name: string, parentId: number | null) => {
      await updateCategory(id, name, parentId);
      await loadCategories();
    },
    [loadCategories]
  );

  const deleteCategoryFn = useCallback(
    async (id: number) => {
      await deleteCategory(id);
      await loadCategories();
    },
    [loadCategories]
  );

  return {
    categories,
    isLoadingCategories,
    addCategory,
    updateCategory: updateCategoryFn,
    deleteCategory: deleteCategoryFn,
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
