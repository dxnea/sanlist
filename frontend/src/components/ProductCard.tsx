import { memo, type MouseEvent } from 'react';
import { FiEdit2, FiTrash2, FiStar, FiShoppingCart } from 'react-icons/fi';
import type { Product } from '../types';
import { getImageUrl, getUnitStep, isEditableElement } from '../utils/formatters';

export interface ProductCardProps {
  product: Product;
  isFavorite: boolean;
  qtyDraft: string;
  isListBusy: boolean;
  onOpenPreview: (product: Product) => void;
  onToggleFavorite: (productId: number) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onQtyDraftChange: (productId: number, value: string) => void;
  onAddToCurrentList: (product: Product, quantity: number) => void;
}

export const ProductCard = memo((props: ProductCardProps) => {
  const {
    product,
    isFavorite,
    qtyDraft,
    isListBusy,
    onOpenPreview,
    onToggleFavorite,
    onEditProduct,
    onDeleteProduct,
    onQtyDraftChange,
    onAddToCurrentList,
  } = props;

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    if (isEditableElement(event.target)) {
      return;
    }
    onOpenPreview(product);
  };

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleFavorite(product.id);
  };

  const handleEditClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onEditProduct(product);
  };

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDeleteProduct(product);
  };

  const handleQtyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onQtyDraftChange(product.id, event.target.value);
  };

  const handleAddToCart = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const quantity = qtyDraft ? Number(qtyDraft) : 1;
    if (quantity > 0) {
      onAddToCurrentList(product, quantity);
    }
  };

  const imageUrl = getImageUrl(product.image_url);
  const step = getUnitStep(product.unit);

  return (
    <article
      className="product-card"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
    >
      <div className="product-card-image">
        <img src={imageUrl} alt={product.name} />
        <button
          className={`favorite-button ${isFavorite ? 'active' : ''}`}
          onClick={handleFavoriteClick}
          type="button"
          aria-label={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
        >
          <FiStar />
        </button>
      </div>

      <div className="product-card-body">
        <h3 className="product-card-name">{product.name}</h3>

        <div className="product-card-meta">
          <span className="product-card-unit">{product.unit}</span>
        </div>

        <div className="quick-add-row">
          <label className="quantity-input-group">
            <input
              className="quantity-input"
              type="number"
              step={step}
              min="0"
              placeholder="Кол-во"
              value={qtyDraft}
              onChange={handleQtyChange}
              disabled={isListBusy}
            />
          </label>
          <button
            className="button button-primary"
            onClick={handleAddToCart}
            disabled={isListBusy}
            type="button"
          >
            <FiShoppingCart />
          </button>
        </div>

        <div className="product-card-actions">
          <button
            className="icon-button"
            onClick={handleEditClick}
            type="button"
            aria-label="Редактировать"
          >
            <FiEdit2 />
          </button>
          <button
            className="icon-button danger"
            onClick={handleDeleteClick}
            type="button"
            aria-label="Удалить"
          >
            <FiTrash2 />
          </button>
        </div>
      </div>
    </article>
  );
});
