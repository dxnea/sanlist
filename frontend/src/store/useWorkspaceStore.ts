import { create } from 'zustand';

type WorkspaceState = {
  sessionId: string;
  activeListId: number | null;
  favoriteProductIds: number[];
  setSessionId: (sessionId: string) => void;
  setActiveListId: (listId: number | null) => void;
  setFavoriteProductIds: (productIds: number[]) => void;
};

export const SESSION_KEY = 'santex_session_v1';
export const ACTIVE_LIST_KEY = 'santex_active_list_v1';

function getInitialSessionId() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) {
    return saved;
  }

  const generated = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, generated);
  return generated;
}

function getInitialListId() {
  const saved = localStorage.getItem(ACTIVE_LIST_KEY);
  if (!saved) {
    return null;
  }

  const value = Number(saved);
  return Number.isFinite(value) ? value : null;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sessionId: getInitialSessionId(),
  activeListId: getInitialListId(),
  favoriteProductIds: [],
  setSessionId: (sessionId) => {
    localStorage.setItem(SESSION_KEY, sessionId);
    set({ sessionId });
  },
  setActiveListId: (listId) => {
    if (listId === null) {
      localStorage.removeItem(ACTIVE_LIST_KEY);
    } else {
      localStorage.setItem(ACTIVE_LIST_KEY, String(listId));
    }
    set({ activeListId: listId });
  },
  setFavoriteProductIds: (favoriteProductIds) => set({ favoriteProductIds }),
}));
