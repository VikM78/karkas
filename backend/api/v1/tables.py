"""
API для работы с таблицами.

Универсальные эндпоинты — работают для любой таблицы из реестра моделей.
Никакого хардкода конкретных моделей.

Эндпоинты:
    # Метаданные и данные
    GET    /<table_key>/schema                 — схема (метаданные)
    GET    /<table_key>/data                   — список записей
    GET    /<table_key>/distinct/<column>      — уникальные значения столбца
    GET    /<table_key>/settings               — настройки пользователя
    POST   /<table_key>/settings               — сохранить настройки

    # CRUD
    POST   /<table_key>/row                    — создать
    GET    /<table_key>/row/<row_id>           — получить одну
    PUT    /<table_key>/row/<row_id>           — обновить
    PATCH  /<table_key>/row/<row_id>/mark-delete    — пометить на удаление
    PATCH  /<table_key>/row/<row_id>/unmark-delete  — снять пометку
    DELETE /<table_key>/row/<row_id>/hard      — полное удаление
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from sqlalchemy import func, or_

from backend.models import db, Table, TableColumn
from backend.models.registry import get_model
from backend.services.table_service import TableService
from backend.services.crud_service import CrudService
from backend.exceptions import CrudError, NotFoundError, ValidationError


bp = Blueprint('tables', __name__, url_prefix='/api/v1/tables')


# ============================================================
# ЕДИНЫЙ ОБРАБОТЧИК ОШИБОК
# ============================================================

@bp.errorhandler(CrudError)
def handle_crud_error(e):
    """Все ошибки CRUD → JSON с правильным HTTP-кодом."""
    return jsonify(e.to_dict()), e.status


# ============================================================
# СХЕМА
# ============================================================

@bp.route('/<table_key>/schema', methods=['GET'])
@jwt_required()
def get_table_schema(table_key):
    """Получить схему таблицы (метаданные)."""
    user_id = int(get_jwt_identity())
    schema = TableService.get_table_schema(table_key, user_id)
    if not schema:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify(schema)


# ============================================================
# ДАННЫЕ
# ============================================================

@bp.route('/<table_key>/data', methods=['GET'])
@jwt_required()
def get_table_data(table_key):
    """
    Получить данные таблицы.

    Query-параметры:
        page              — номер страницы (default 1)
        per_page          — записей на страницу (default 50)
        include_deleted   — true/false (default false)
        sort              — имя столбца для сортировки
        order             — asc/desc (default asc)
        filter_<column>   — значения через запятую

    Пример:
        /data?page=1&per_page=50&sort=name&order=asc&filter_status=paused,archived
    """
    user_id = int(get_jwt_identity())

    # Пагинация
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    # Сортировка — поддержка мультисортировки
    sort_key = request.args.get('sort', '')
    sort_direction = request.args.get('order', 'asc')

    sort_list = []
    if sort_key:
        sort_list.append({'key': sort_key, 'direction': sort_direction})

    # Фильтры
    filters = {}
    for key in request.args:
        if not key.startswith('filter_'):
            continue
        column = key.replace('filter_', '')
        raw = request.args.get(key, '').strip()
        if not raw:
            continue
        values = [v.strip() for v in raw.split(',') if v.strip()]
        if values:
            filters[column] = values

    # include_deleted
    include_deleted = request.args.get('include_deleted', 'false').lower() in ('true', '1', 'yes')

    params = {
        'page': page,
        'per_page': per_page,
        'filters': filters,
        'sort': sort_list,
        'include_deleted': include_deleted,
    }

    result = TableService.get_table_data(table_key, user_id, params)
    if result is None:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify(result)


# ============================================================
# DISTINCT — уникальные значения столбца (для фильтров)
# ============================================================

@bp.route('/<table_key>/distinct/<column>', methods=['GET'])
@jwt_required()
def get_distinct_values(table_key, column):
    """
    Получить уникальные значения столбца (для выпадашки фильтра).

    Учитывает другие фильтры — кроме самого этого столбца.
    Также возвращает:
        - null_label — метка для «пустых» значений (из типа столбца)
        - labels — маппинг value → {label, color, icon} (для status)
        - has_empty — есть ли NULL в данных

    Query-параметры: те же, что и у /data (кроме filter_<column>).
    """
    user_id = int(get_jwt_identity())

    model = get_model(table_key)
    if not model:
        return jsonify({'error': f'Модель для таблицы "{table_key}" не найдена'}), 404

    table = Table.query.filter_by(table_key=table_key, is_active=True).first()
    if not table:
        return jsonify({'error': f'Таблица "{table_key}" не найдена'}), 404

    # Проверяем, что столбец есть в модели
    if not hasattr(model, column):
        return jsonify({'error': f'Столбец "{column}" не найден в модели'}), 404

    # Определяем колонку метаданных (для типа и mapping)
    table_column = TableColumn.query.filter_by(
        table_id=table.id,
        column_key=column,
    ).first()

    # include_deleted
    include_deleted = request.args.get('include_deleted', 'false').lower() in ('true', '1', 'yes')

    # Собираем фильтры (кроме самого этого столбца)
    filters = {}
    for key in request.args:
        if not key.startswith('filter_'):
            continue
        col = key.replace('filter_', '')
        if col == column:
            continue  # пропускаем фильтр по самому себе
        raw = request.args.get(key, '').strip()
        if not raw:
            continue
        values = [v.strip() for v in raw.split(',') if v.strip()]
        if values:
            filters[col] = values

    # Базовый запрос
    col_attr = getattr(model, column)
    query = db.session.query(col_attr)

    # is_deleted
    if 'is_deleted' in filters:
        bool_vals = [v.lower() in ('true', '1', 'yes') for v in filters['is_deleted']]
        query = query.filter(model.is_deleted.in_(bool_vals))
    elif not include_deleted:
        query = query.filter(model.is_deleted == False)

    # Другие фильтры
    for col_key, values in filters.items():
        if col_key == 'is_deleted':
            continue
        if not hasattr(model, col_key):
            continue
        other_col = getattr(model, col_key)

        # Особая обработка NULL-маркера
        if '__null__' in values:
            non_null = [v for v in values if v != '__null__']
            if non_null:
                query = query.filter(or_(other_col.is_(None), other_col.in_(non_null)))
            else:
                query = query.filter(other_col.is_(None))
        else:
            query = query.filter(other_col.in_(values))

    # Уникальные значения
    rows = query.distinct().all()
    values = [row[0] for row in rows]

    # Разделяем NULL и не-NULL
    has_empty = any(v is None for v in values)
    non_null_values = sorted([v for v in values if v is not None], key=lambda x: str(x))

    # Метка для NULL — из типа столбца
    null_label = None
    labels_map = {}

    if table_column and table_column.column_type:
        null_label = table_column.column_type.null_label

        # Для status — маппинг значений
        if table_column.column_type.type_key == 'status':
            mappings = table_column.values.filter_by(is_active=True).all()
            for m in mappings:
                labels_map[m.value_key] = {
                    'label': m.value_label,
                    'color': m.value_color,
                    'icon': m.value_icon,
                    'show_in_filter': m.show_in_filter,
                }

    return jsonify({
        'values': non_null_values,
        'has_empty': has_empty,
        'null_label': null_label,
        'labels': labels_map,
        'total': len(non_null_values) + (1 if has_empty else 0),
    })


# ============================================================
# НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ
# ============================================================

@bp.route('/<table_key>/settings', methods=['GET'])
@jwt_required()
def get_table_settings(table_key):
    """Получить настройки пользователя для таблицы."""
    user_id = int(get_jwt_identity())
    settings = TableService.get_user_settings(table_key, user_id)
    if settings is None:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify(settings)


@bp.route('/<table_key>/settings', methods=['POST', 'PUT'])
@jwt_required()
def save_table_settings(table_key):
    """Сохранить настройки пользователя для таблицы."""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Нет данных'}), 400
    settings = TableService.save_user_settings(table_key, user_id, data)
    if settings is None:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify({'settings': settings})


# ============================================================
# CRUD — УНИВЕРСАЛЬНЫЕ ЭНДПОИНТЫ
# ============================================================

@bp.route('/<table_key>/row', methods=['POST'])
@jwt_required()
def create_row(table_key):
    """Создать запись."""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    if data is None:
        raise ValidationError('Тело запроса должно быть JSON-объектом')

    result = CrudService.create(table_key, data, user_id=user_id)
    return jsonify(result), 201


@bp.route('/<table_key>/row/<int:row_id>', methods=['GET'])
@jwt_required()
def get_row(table_key, row_id):
    """Получить одну запись по ID."""
    result = CrudService.get(table_key, row_id)
    return jsonify(result)


@bp.route('/<table_key>/row/<int:row_id>', methods=['PUT'])
@jwt_required()
def update_row(table_key, row_id):
    """Обновить запись."""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    if data is None:
        raise ValidationError('Тело запроса должно быть JSON-объектом')

    result = CrudService.update(table_key, row_id, data, user_id=user_id)
    return jsonify(result)


@bp.route('/<table_key>/row/<int:row_id>/mark-delete', methods=['PATCH'])
@jwt_required()
def mark_delete_row(table_key, row_id):
    """Пометить запись на удаление."""
    user_id = int(get_jwt_identity())
    result = CrudService.soft_delete(table_key, row_id, user_id=user_id)
    return jsonify(result)


@bp.route('/<table_key>/row/<int:row_id>/unmark-delete', methods=['PATCH'])
@jwt_required()
def unmark_delete_row(table_key, row_id):
    """Снять пометку на удаление."""
    user_id = int(get_jwt_identity())
    result = CrudService.restore(table_key, row_id, user_id=user_id)
    return jsonify(result)


@bp.route('/<table_key>/row/<int:row_id>/hard', methods=['DELETE'])
@jwt_required()
def hard_delete_row(table_key, row_id):
    """Полное удаление записи (без возможности восстановления)."""
    user_id = int(get_jwt_identity())
    result = CrudService.hard_delete(table_key, row_id, user_id=user_id)
    return jsonify(result)