"""
Утилиты для работы с измерениями (ширина, высота и т.п.).

Формат хранения: строка с единицей измерения.
Пример: '15.625rem', '250px', '20ch', '15%'.

Если единица не указана — считаем px.
"""

import re
from decimal import Decimal


# Допустимые единицы
VALID_UNITS = ('px', 'rem', 'ch', 'em', '%')

# Регулярка: число + опциональная единица
MEASURE_PATTERN = re.compile(
    r'^\s*([0-9]+(?:\.[0-9]+)?)\s*([a-z%]*)\s*$'
)


def normalize_measure(value):
    """
    Нормализовать строку измерения.

    '15.625rem' → '15.625rem'
    '250px'     → '250px'
    '250'       → '250px'       (без единицы → px)
    '  250  '   → '250px'
    '20ch'      → '20ch'
    ''          → None
    None        → None
    'abc'       → None

    :param value: входное значение.
    :return: нормализованная строка или None.
    """
    if value is None:
        return None

    s = str(value).strip()
    if not s:
        return None

    match = MEASURE_PATTERN.match(s)
    if not match:
        return None

    num_str = match.group(1)
    unit = match.group(2) or 'px'

    if unit not in VALID_UNITS:
        return None

    # Нормализуем число: '250.0' → '250', '15.625' → '15.625'
    num = float(num_str)
    if num == int(num):
        num_str = str(int(num))
    else:
        num_str = str(num)

    return f'{num_str}{unit}'


def parse_measure(value, base_font_size_px=16.0):
    """
    Разобрать строку измерения.

    Возвращает dict:
        {
            'raw': '15.625rem',   # нормализованное
            'value': 15.625,      # число
            'unit': 'rem',        # единица
            'rem': 15.625,        # значение в rem (или None)
            'px': 250.0,          # значение в px для FHD (или None)
        }
    """
    normalized = normalize_measure(value)
    if not normalized:
        return None

    match = MEASURE_PATTERN.match(normalized)
    num = float(match.group(1))
    unit = match.group(2)

    rem = None
    px = None

    if unit == 'rem':
        rem = num
        px = num * base_font_size_px
    elif unit == 'px':
        px = num
        rem = num / base_font_size_px
    elif unit == 'ch':
        rem = num * 0.55        # 1ch ≈ 0.55rem
        px = rem * base_font_size_px
    elif unit == 'em':
        rem = num               # приблизительно
        px = num * base_font_size_px
    elif unit == '%':
        # Относительно — контекст не известен
        pass

    return {
        'raw': normalized,
        'value': num,
        'unit': unit,
        'rem': rem,
        'px': px,
    }


def is_normalized(value):
    """Проверить, что значение уже нормализовано (есть единица)."""
    if value is None:
        return True  # NULL — ОК
    s = str(value).strip()
    if not s:
        return True
    return bool(re.search(r'[a-z%]$', s, re.IGNORECASE))