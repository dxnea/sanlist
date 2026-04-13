import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ListItem, ShoppingList, Product } from '../types';
import {
  getShoppingLists,
  getListItems,
  addListItem,
  updateListItem as updateListItemDb,
  deleteListItem as deleteListItemDb,
  getProducts,
} from '../db/dbService';
import type { ListItemRecord, ShoppingListRecord } from '../db/database';

interface UseCartOptions {
  apiBase: string;
  sessionId: string;
  activeListId: number | null;
}

function normalizeListRecord(record: ShoppingListRecord): ShoppingList {
  return {
    id: record.id!,
    session_id: '',
    name: record.name,
    status: record.status,
    completed_at: record.completed_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

async function enrichListItem(record: ListItemRecord, productsMap: Map<number, Product>): Promise<ListItem> {
  const product = productsMap.get(record.product_id) || {
    id: record.product_id,
    name: 'Товар удалён',
    price: null,
    unit: 'шт',
    image_url: null,
    category_id: 0,
    is_custom: false,
    created_at: '',
  };

  return {
    id: record.id!,
    list_id: record.list_id,
    product_id: record.product_id,
    quantity: record.quantity,
    note: record.note,
    product,
  };
}

export function useCart(options: UseCartOptions) {
  const { activeListId } = options;

  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [activeLists, setActiveLists] = useState<ShoppingList[]>([]);
  const [historyLists, setHistoryLists] = useState<ShoppingList[]>([]);
  const [isListBusy, setIsListBusy] = useState(false);

  const loadLists = useCallback(
    async (status: 'active' | 'completed') => {
      const data = await getShoppingLists(status);
      return data.map(normalizeListRecord);
    },
    []
  );

  const loadItemsForList = useCallback(
    async (listId: number) => {
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

      const items = await Promise.all(records.map((r) => enrichListItem(r, productsMap)));
      setListItems(items);
    },
    []
  );

  const refreshLists = useCallback(async () => {
    try {
      const [active, completed] = await Promise.all([loadLists('active'), loadLists('completed')]);
      setActiveLists(active);
      setHistoryLists(completed);
    } catch (error) {
      console.error('Failed to refresh lists:', error);
    }
  }, [loadLists]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    if (!activeListId) {
      return;
    }
    void loadItemsForList(activeListId);
  }, [activeListId, loadItemsForList]);

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

  const addToCurrentList = useCallback(
    async (productId: number, quantity: number, note: string | null = null) => {
      if (!activeListId) {
        return;
      }

      setIsListBusy(true);
      try {
        await addListItem(activeListId, productId, quantity, note);
        await loadItemsForList(activeListId);
      } catch (error) {
        console.error('Failed to add to list:', error);
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, loadItemsForList]
  );

  const updateListItemFn = useCallback(
    async (itemId: number, payload: { quantity?: number; note?: string | null }) => {
      if (!activeListId) {
        return;
      }

      setIsListBusy(true);
      try {
        await updateListItemDb(itemId, activeListId, payload);
        await loadItemsForList(activeListId);
      } catch (error) {
        console.error('Failed to update item:', error);
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, loadItemsForList]
  );

  const deleteListItemFn = useCallback(
    async (itemId: number) => {
      if (!activeListId) {
        return;
      }

      setIsListBusy(true);
      try {
        await deleteListItemDb(itemId, activeListId);
        await loadItemsForList(activeListId);
      } catch (error) {
        console.error('Failed to delete item:', error);
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, loadItemsForList]
  );

  const clearList = useCallback(async () => {
    if (!activeListId) {
      return;
    }

    setIsListBusy(true);
    try {
      const items = await getListItems(activeListId);
      await Promise.all(items.map((item) => deleteListItemDb(item.id!, activeListId)));
      setListItems([]);
    } catch (error) {
      console.error('Failed to clear list:', error);
    } finally {
      setIsListBusy(false);
    }
  }, [activeListId]);

  const exportCartToTxt = useCallback(() => {
    if (listItems.length === 0) {
      return;
    }

    const lines: string[] = [];
    lines.push(`Список покупок`);
    lines.push(`Дата: ${new Date().toLocaleString('ru-RU')}`);
    lines.push('');
    lines.push(`Товары (${listItems.length}):`);
    lines.push('');

    listItems.forEach((item) => {
      const priceStr = item.product.price !== null ? ` - ${item.product.price} ₽` : '';
      lines.push(`• ${item.product.name}${priceStr} — ${item.quantity} ${item.product.unit}`);
      if (item.note) {
        lines.push(`  Примечание: ${item.note}`);
      }
    });

    lines.push('');
    lines.push(`Итого: ${cartTotal.toFixed(2)} ₽`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spisok-pokupok-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [listItems, cartTotal]);

  return {
    listItems,
    activeLists,
    historyLists,
    cartCount,
    cartTotal,
    isListBusy,
    addToCurrentList,
    updateListItem: updateListItemFn,
    deleteListItem: deleteListItemFn,
    clearList,
    exportCartToTxt,
    refreshLists,
    loadItemsForList,
  };
}
