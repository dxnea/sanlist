// VirtualProductsGrid.tsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { Product } from '../types';
import { ProductCard } from './ProductCard';

export interface VirtualProductsGridProps {
  products: Product[];
  favoriteSet: Set<number>;
  qtyDrafts: Record<number, string>;
  isListBusy: boolean;
  isCompact: boolean;
  desktopColumns: 1 | 2 | 3 | 4 | 5;
  mobileColumns: 1 | 2 | 3 | 4 | 5;
  hasMoreProducts: boolean;
  isLoadingMoreProducts: boolean;
  onLoadMoreProducts: () => void;
  onOpenPreview: (product: Product) => void;
  onToggleFavorite: (productId: number) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onQtyDraftChange: (productId: number, value: string) => void;
  onAddToCurrentList: (product: Product, quantity: number) => void;
  lastLoadMoreRowRef: React.MutableRefObject<number>;
  showFavoritesOnly: boolean; // новый проп
}

export const VirtualProductsGrid = memo((props: VirtualProductsGridProps) => {
  const {
    products,
    favoriteSet,
    qtyDrafts,
    isListBusy,
    isCompact,
    desktopColumns,
    mobileColumns,
    hasMoreProducts,
    isLoadingMoreProducts,
    onLoadMoreProducts,
    onOpenPreview,
    onToggleFavorite,
    onEditProduct,
    onDeleteProduct,
    onQtyDraftChange,
    onAddToCurrentList,
    showFavoritesOnly, // деструктурируем
  } = props;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const isEndReachedTriggeredRef = useRef(false);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    let prevWidth = 0;
    let prevHeight = 0;

    const resize = () => {
      const width = Math.max(0, element.clientWidth);
      const height = Math.max(0, element.clientHeight);
      if (width !== prevWidth || height !== prevHeight) {
        prevWidth = width;
        prevHeight = height;
        setViewportSize({ width, height });
      }
    };

    resize();
    const observer = new ResizeObserver(() => resize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isMobileWidth = viewportSize.width <= 767;
  const columnCount = isMobileWidth ? mobileColumns : desktopColumns;
  const gap = isCompact ? 10 : 12;

  const gridHeight = Math.max(260, viewportSize.height);

  // Группируем товары в строки
  const rows = [];
  for (let i = 0; i < products.length; i += columnCount) {
    rows.push(products.slice(i, i + columnCount));
  }

  const handleEndReached = useCallback(() => {
    // В избранном не подгружаем
    if (showFavoritesOnly) return;
    if (!hasMoreProducts || isLoadingMoreProducts || isEndReachedTriggeredRef.current) {
      return;
    }
    isEndReachedTriggeredRef.current = true;
    onLoadMoreProducts();
    setTimeout(() => {
      isEndReachedTriggeredRef.current = false;
    }, 100);
  }, [hasMoreProducts, isLoadingMoreProducts, onLoadMoreProducts, showFavoritesOnly]);

  if (viewportSize.width === 0) {
    return <div className="products-virtual-shell" ref={viewportRef} />;
  }

  return (
    <div
      className="products-virtual-shell"
      ref={viewportRef}
      style={{ height: gridHeight, overflow: 'hidden' }}
    >
      <Virtuoso
        data={rows}
        itemContent={(_, rowProducts) => {
          return (
            <div
              style={{
                paddingBottom: gap,
              }}
            >
              <div
                className={`products-grid ${isCompact ? 'compact' : ''} ${
                  isMobileWidth ? `mobile-cols-${columnCount}` : `desktop-cols-${columnCount}`
                }`.trim()}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  gap: `${gap}px`,
                }}
              >
                {rowProducts.map((product) => {
                  const qtyDraft = qtyDrafts[product.id] ?? '';
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isFavorite={favoriteSet.has(product.id)}
                      qtyDraft={qtyDraft}
                      isListBusy={isListBusy}
                      onOpenPreview={onOpenPreview}
                      onToggleFavorite={onToggleFavorite}
                      onEditProduct={onEditProduct}
                      onDeleteProduct={onDeleteProduct}
                      onQtyDraftChange={onQtyDraftChange}
                      onAddToCurrentList={onAddToCurrentList}
                    />
                  );
                })}
              </div>
            </div>
          );
        }}
        endReached={handleEndReached}
        overscan={2}
        style={{ height: '100%' }}
        increaseViewportBy={200}
      />
      {isLoadingMoreProducts && <div className="products-load-state">Загрузка ещё товаров...</div>}
    </div>
  );
});