import argparse
import csv
import re
from collections import Counter


def build_rules():
    rules = []

    def add(category, subcategory, patterns):
        rules.append(
            {
                'category': category,
                'subcategory': subcategory,
                'patterns': [re.compile(pattern, re.IGNORECASE) for pattern in patterns],
            }
        )

    add('Сантехника', 'Смесители', [r'смесител', r'душев(ой|ая)', r'душев(ой|ая) гарнитур'])
    add('Сантехника', 'Гибкие подводки', [r'подводк', r'гибк(ая|ое) соединен'])

    add('Санфаянс', 'Унитазы', [r'унитаз'])
    add('Санфаянс', 'Раковины', [r'раковин', r'умывальник'])
    add('Санфаянс', 'Ванны', [r'\bванн(а|ы|у|ой|е)\b', r'штора для ванной', r'карниз.*штор'])

    add('Канализационные системы', 'Сифоны', [r'сифон'])
    add('Канализационные системы', 'Трапы', [r'\bтрап\b', r'дождеприем', r'водоотводн(ый|ая) лоток'])
    add('Канализационные системы', 'Гофры', [r'\bгофр'])
    add('Канализационные системы', 'Уплотнители', [r'манжет'])
    add('Канализационные системы', 'Трубы и фитинги', [r'канализац', r'ревизия', r'аэратор'])

    add('Запорно-регулирующая арматура', 'Краны шаровые', [r'кран шаров'])
    add('Запорно-регулирующая арматура', 'Клапаны', [r'клапан', r'редуктор', r'воздухоотвод', r'сервопривод'])
    add('Запорно-регулирующая арматура', 'Краны', [r'\bкран\b', r'кран-букс', r'букса'])

    add('Трубы и фитинги', 'Коллекторы', [r'коллектор', r'гидрострел', r'шкаф.*коллектор'])
    add('Трубы и фитинги', 'Трубы', [r'\bтруба\b', r'утеплител.*труб', r'теплоизоляционн.*трубк'])
    add(
        'Трубы и фитинги',
        'Фитинги',
        [
            r'муфта',
            r'угол(?!ов)|угольник',
            r'тройник',
            r'крестовин',
            r'штуцер',
            r'ниппел',
            r'футорк',
            r'американк',
            r'заглушк',
            r'водорозетк',
            r'соединител',
            r'бочонок',
            r'обжимн',
        ],
    )

    add('Насосы', 'Насосы', [r'\bнасос', r'гидроаккум', r'насосн(ая|ый) станц'])
    add('Котлы', 'Котлы', [r'\bкот[её]л', r'\bэвпм\b'])
    add(
        'Водонагреватели',
        'Накопительные',
        [r'водонагрев', r'\bтэ?н\b', r'нагревательн(ый|ого) элемент', r'\bанод\b', r'бойлер'],
    )

    add('Радиаторы и отопление', 'Полотенцесушители', [r'полотенцесуш'])
    add('Радиаторы и отопление', 'Радиаторы', [r'радиатор', r'конвектор', r'кронштейн.*радиатор'])

    add('Фильтры', 'Картриджи', [r'картридж'])
    add('Фильтры', 'Фильтры', [r'\bфильтр\b', r'геотекстиль'])

    add('Расходники', 'СИЗ', [r'перчат', r'очки', r'респиратор', r'маск', r'наколен', r'наушник', r'щиток'])
    add('Расходники', 'Крепёж', [r'стяжк', r'дюбел', r'крепеж', r'клипс'])
    add('Расходники', 'Уплотнители', [r'лента', r'скотч', r'серпян', r'изолент', r'герметик', r'прокладк'])

    add(
        'Инструмент',
        'Оснастка',
        [
            r'сверл',
            r'коронк',
            r'диск',
            r'круг',
            r'щетк',
            r'бита',
            r'пилка',
            r'полотно',
            r'бур',
            r'абразив',
            r'шлиф',
            r'маркер',
            r'карандаш',
        ],
    )

    return rules


def classify(name, rules):
    normalized = name.lower()
    for rule in rules:
        for pattern in rule['patterns']:
            if pattern.search(normalized):
                return rule['category'], rule['subcategory']
    return None


def should_update(current, predicted):
    current_path = f'{current[0]} / {current[1]}'
    predicted_path = f'{predicted[0]} / {predicted[1]}'

    if current_path == predicted_path:
        return False

    if current_path == 'Прочее / Разное':
        return True

    suspicious_sources = {
        'Санфаянс / Ванны',
        'Санфаянс / Раковины',
        'Фильтры / Фильтры',
        'Расходники / Крепёж',
    }

    if current_path in suspicious_sources and predicted_path != current_path:
        return True

    return False


def main():
    parser = argparse.ArgumentParser(description='Исправление категорий в merged_products_final.csv по названию товара')
    parser.add_argument('csv_path')
    parser.add_argument('--write', action='store_true', help='Перезаписать файл')
    parser.add_argument('--backup', action='store_true', help='Создать backup файл рядом')
    parser.add_argument('--samples', type=int, default=0, help='Показать примеры изменённых строк')
    args = parser.parse_args()

    rules = build_rules()

    with open(args.csv_path, 'r', encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])
    original_rows = [dict(row) for row in rows]

    changes = 0
    transitions = Counter()
    samples = []

    for row in rows:
        name = str(row.get('Название', '')).strip()
        if not name:
            continue

        predicted = classify(name, rules)
        if not predicted:
            continue

        current = (str(row.get('Категория', '')).strip(), str(row.get('Подкатегория', '')).strip())
        if not should_update(current, predicted):
            continue

        row['Категория'] = predicted[0]
        row['Подкатегория'] = predicted[1]
        row['Путь категории'] = f'{predicted[0]} / {predicted[1]}'
        transitions[(current, predicted)] += 1
        changes += 1
        if args.samples > 0 and len(samples) < args.samples:
            samples.append((name, current, predicted))

    print(f'Изменено строк: {changes}')
    for (src, dst), count in transitions.most_common(30):
        print(f'{count:>4}  {src[0]} / {src[1]}  ->  {dst[0]} / {dst[1]}')

    if samples:
        print('\nПримеры:')
        for name, src, dst in samples:
            print(f'- {name}\n    {src[0]} / {src[1]}  ->  {dst[0]} / {dst[1]}')

    if not args.write:
        return

    if args.backup:
        backup_path = f'{args.csv_path}.bak'
        with open(backup_path, 'w', encoding='utf-8-sig', newline='') as backup:
            writer = csv.DictWriter(backup, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
            writer.writeheader()
            writer.writerows(original_rows)

    with open(args.csv_path, 'w', encoding='utf-8-sig', newline='') as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == '__main__':
    main()
