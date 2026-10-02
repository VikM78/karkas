"""
Валидаторы для CrudService.

Функции для каждого типа правила из validation_rules:
    - validate_required
    - validate_min_length
    - validate_max_length
    - validate_regex
    - validate_range
    - validate_unique
    - validate_custom

Каждая функция:
    - принимает значение и params;
    - возвращает (bool, str | None) — валидно ли, сообщение об ошибке.
"""

import re
from backend.models import db
from backend.models.registry import get_model


# ============================================================
# ВСПОМОГАТЕЛЬНОЕ
# ============================================================

def is_empty(value):
    """Проверить, пустое ли значение (None, '', [], {})."""
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == '':
        return True
    if isinstance(value, (list, dict)) and len(value) == 0:
        return True
    return False


# ============================================================
# ПРАВИЛА
# ============================================================

def validate_required(value, params, context=None):
    """Поле обязательно."""
    if is_empty(value):
        return False, 'Поле обязательно для заполнения'
    return True, None


def validate_min_length(value, params, context=None):
    """Минимальная длина."""
    if is_empty(value):
        return True, None  # пустое — пропускаем, required проверит отдельно
    min_len = params.get('value', 0)
    if len(str(value)) < min_len:
        return False, f'Минимум {min_len} символов'
    return True, None


def validate_max_length(value, params, context=None):
    """Максимальная длина."""
    if is_empty(value):
        return True, None
    max_len = params.get('value', 999999)
    if len(str(value)) > max_len:
        return False, f'Максимум {max_len} символов'
    return True, None


def validate_regex(value, params, context=None):
    """Соответствие регулярному выражению."""
    if is_empty(value):
        return True, None
    pattern = params.get('pattern')
    if not pattern:
        return True, None
    if not re.match(pattern, str(value)):
        return False, params.get('error', 'Неверный формат')
    return True, None


def validate_range(value, params, context=None):
    """Число в диапазоне."""
    if is_empty(value):
        return True, None
    try:
        num = float(value)
    except (ValueError, TypeError):
        return False, 'Значение должно быть числом'
    min_val = params.get('min')
    max_val = params.get('max')
    if min_val is not None and num < min_val:
        return False, f'Значение меньше {min_val}'
    if max_val is not None and num > max_val:
        return False, f'Значение больше {max_val}'
    return True, None


def validate_unique(value, params, context=None):
    """Уникальность значения."""
    if is_empty(value):
        return True, None
    if not context:
        return True, None  # нет контекста — не можем проверить

    table_key = context.get('table_key')
    column_key = context.get('column_key')
    exclude_id = context.get('exclude_id')  # при update — исключить себя
    case_sensitive = params.get('case_sensitive', False)

    model = get_model(table_key)
    if not model:
        return True, None

    column = getattr(model, column_key, None)
    if column is None:
        return True, None

    query = db.session.query(model)

    if case_sensitive:
        query = query.filter(column == value)
    else:
        from sqlalchemy import func
        query = query.filter(func.lower(column) == str(value).lower())

    if exclude_id is not None:
        query = query.filter(model.id != exclude_id)

    if query.first():
        return False, 'Значение должно быть уникальным'
    return True, None


def validate_custom(value, params, context=None):
    """Кастомная функция валидации."""
    if is_empty(value):
        return True, None
    module_name = params.get('module')
    func_name = params.get('func')
    if not module_name or not func_name:
        return True, None
    try:
        import importlib
        module = importlib.import_module(module_name)
        func = getattr(module, func_name)
    except (ImportError, AttributeError):
        return False, f'Не найдена функция валидации: {module_name}.{func_name}'

    try:
        result = func(value, context or {})
    except Exception as e:
        return False, f'Ошибка в валидации: {e}'

    # Функция возвращает:
    # - True → валидно
    # - False → не валидно
    # - (bool, str) → кортеж
    # - str → сообщение об ошибке (значит — не валидно)
    if isinstance(result, tuple):
        return result
    if result is True:
        return True, None
    if result is False:
        return False, 'Значение не прошло проверку'
    if isinstance(result, str):
        return False, result
    return True, None


def validate_no_references(value, params, context=None):
    """
    Проверка отсутствия ссылок на запись.

    Используется при soft_delete / hard_delete.
    value — обычно id удаляемой записи.
    params['references'] — список:
        [{"table": "products", "column": "manufacturer_id", "label": "Товары"}]
    """
    if not context:
        return True, None

    row_id = context.get('row_id')
    if row_id is None:
        return True, None

    references = params.get('references', [])
    if not references:
        return True, None

    from sqlalchemy import func

    for ref in references:
        ref_table_key = ref.get('table')
        ref_column = ref.get('column')
        ref_label = ref.get('label', ref_table_key)

        if not ref_table_key or not ref_column:
            continue

        ref_model = get_model(ref_table_key)
        if not ref_model:
            continue

        ref_col = getattr(ref_model, ref_column, None)
        if ref_col is None:
            continue

        count = db.session.query(func.count(ref_model.id)).filter(
            ref_col == row_id
        ).scalar()

        if count and count > 0:
            return False, f'На запись ссылаются: {ref_label} ({count})'

    return True, None


# ============================================================
# РЕЕСТР ВАЛИДАТОРОВ
# ============================================================

VALIDATORS = {
    'required': validate_required,
    'min_length': validate_min_length,
    'max_length': validate_max_length,
    'regex': validate_regex,
    'range': validate_range,
    'unique': validate_unique,
    'custom': validate_custom,
    'no_references': validate_no_references,
}


def get_validator(rule_type):
    """Получить функцию-валидатор по типу правила."""
    return VALIDATORS.get(rule_type)