import { useCallback, useEffect, useMemo, useState } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';
import type { ListItem, ShoppingList } from '../types';
import { handleApiError } from '../utils/apiError';

interface UseCartOptions {
  apiBase: string;
  sessionId: string;
  activeListId: number | null;
}

export function useCart(options: UseCartOptions) {
  const { apiBase, sessionId, activeListId } = options;

  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [activeLists, setActiveLists] = useState<ShoppingList[]>([]);
  const [historyLists, setHistoryLists] = useState<ShoppingList[]>([]);
  const [isListBusy, setIsListBusy] = useState(false);

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

  const loadLists = useCallback(
    async (status: 'active' | 'completed') => {
      const data = await apiRequest<ShoppingList[]>({ url: '/lists', params: { status } });
      return data;
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

  const refreshLists = useCallback(async () => {
    try {
      const [active, completed] = await Promise.all([loadLists('active'), loadLists('completed')]);
      setActiveLists(active);
      setHistoryLists(completed);
    } catch (error) {
      console.error('Failed to refresh lists:', handleApiError(error));
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
        await apiRequest<ListItem[]>({
          url: `/lists/${activeListId}/items`,
          method: 'POST',
          data: { productId, quantity, note },
        });
        await loadItemsForList(activeListId);
      } catch (error) {
        console.error('Failed to add to list:', handleApiError(error));
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, apiRequest, loadItemsForList]
  );

  const updateListItem = useCallback(
    async (itemId: number, payload: { quantity?: number; note?: string | null }) => {
      if (!activeListId) {
        return;
      }

      setIsListBusy(true);
      try {
        await apiRequest<ListItem[]>({
          url: `/lists/${activeListId}/items/${itemId}`,
          method: 'PUT',
          data: payload,
        });
        await loadItemsForList(activeListId);
      } catch (error) {
        console.error('Failed to update item:', handleApiError(error));
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, apiRequest, loadItemsForList]
  );

  const deleteListItem = useCallback(
    async (itemId: number) => {
      if (!activeListId) {
        return;
      }

      setIsListBusy(true);
      try {
        await apiRequest({
          url: `/lists/${activeListId}/items/${itemId}`,
          method: 'DELETE',
        });
        await loadItemsForList(activeListId);
      } catch (error) {
        console.error('Failed to delete item:', handleApiError(error));
      } finally {
        setIsListBusy(false);
      }
    },
    [activeListId, apiRequest, loadItemsForList]
  );

  const clearList = useCallback(async () => {
    if (!activeListId) {
      return;
    }

    setIsListBusy(true);
    try {
      await apiRequest({
        url: `/lists/${activeListId}/items`,
        method: 'DELETE',
      });
      setListItems([]);
    } catch (error) {
      console.error('Failed to clear list:', handleApiError(error));
    } finally {
      setIsListBusy(false);
    }
  }, [activeListId, apiRequest]);

  const exportCartToTxt = useCallback(() => {
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

    const blob = new Blob(lines, { type: 'text/plain;charset=utf-8' });
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
    updateListItem,
    deleteListItem,
    clearList,
    exportCartToTxt,
    refreshLists,
    loadItemsForList,
  };
}
