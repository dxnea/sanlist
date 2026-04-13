import { db } from './database';

export async function seedDatabase() {
  const categoryCount = await db.categories.count();
  if (categoryCount > 0) {
    return;
  }

  await db.transaction('rw', db.categories, db.products, async () => {
    const pipes = await db.categories.add({ name: 'Трубы', parent_id: null });
    const fittings = await db.categories.add({ name: 'Фитинги', parent_id: null });
    const mixers = await db.categories.add({ name: 'Смесители', parent_id: null });
    const tools = await db.categories.add({ name: 'Инструменты', parent_id: null });

    const pvc = await db.categories.add({ name: 'ПВХ', parent_id: pipes });
    const metal = await db.categories.add({ name: 'Металл', parent_id: pipes });
    const angles = await db.categories.add({ name: 'Углы', parent_id: fittings });
    const couplings = await db.categories.add({ name: 'Муфты', parent_id: fittings });
    const kitchen = await db.categories.add({ name: 'Для кухни', parent_id: mixers });
    const bathroom = await db.categories.add({ name: 'Для ванной', parent_id: mixers });

    const uncategorized = await db.categories.add({ name: 'Без категории', parent_id: null });

    const now = new Date().toISOString();
    await db.products.bulkAdd([
      { name: 'Труба ПВХ 20 мм', sku: 'PVC-20', price: 120, unit: 'м', image_url: null, category_id: pvc, is_custom: false, created_at: now },
      { name: 'Труба ПВХ 32 мм', sku: 'PVC-32', price: 180, unit: 'м', image_url: null, category_id: pvc, is_custom: false, created_at: now },
      { name: 'Металлопласт труба 16 мм', sku: 'MP-16', price: 240, unit: 'м', image_url: null, category_id: metal, is_custom: false, created_at: now },
      { name: 'Угол 90° ПВХ', sku: 'FIT-90', price: 65, unit: 'шт', image_url: null, category_id: angles, is_custom: false, created_at: now },
      { name: 'Муфта соединительная 20 мм', sku: 'MFT-20', price: 48, unit: 'шт', image_url: null, category_id: couplings, is_custom: false, created_at: now },
      { name: 'Тройник ПВХ 20 мм', sku: 'TR-20', price: 80, unit: 'шт', image_url: null, category_id: angles, is_custom: false, created_at: now },
      { name: 'Смеситель для кухни хром', sku: 'MIX-K-01', price: 2890, unit: 'шт', image_url: null, category_id: kitchen, is_custom: false, created_at: now },
      { name: 'Смеситель для ванной короткий', sku: 'MIX-B-02', price: 3190, unit: 'шт', image_url: null, category_id: bathroom, is_custom: false, created_at: now },
      { name: 'Лента ФУМ', sku: 'FUM-01', price: 95, unit: 'шт', image_url: null, category_id: tools, is_custom: false, created_at: now },
      { name: 'Силикон сантехнический', sku: 'SIL-01', price: 390, unit: 'шт', image_url: null, category_id: tools, is_custom: false, created_at: now },
      { name: 'Ключ разводной 250 мм', sku: 'KEY-250', price: 760, unit: 'шт', image_url: null, category_id: tools, is_custom: false, created_at: now },
      { name: 'Хомут металлический 1/2"', sku: 'CLAMP-12', price: 44, unit: 'шт', image_url: null, category_id: angles, is_custom: false, created_at: now },
      { name: 'Прокладка резиновая 1/2"', sku: 'GASK-12', price: 15, unit: 'шт', image_url: null, category_id: uncategorized, is_custom: false, created_at: now },
      { name: 'Гибкая подводка 60 см', sku: 'FLEX-60', price: 210, unit: 'шт', image_url: null, category_id: uncategorized, is_custom: false, created_at: now },
      { name: 'Монтажный комплект', sku: 'KIT-00', price: null, unit: 'компл.', image_url: null, category_id: uncategorized, is_custom: false, created_at: now },
    ]);
  });
}
