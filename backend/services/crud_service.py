"""
Универсальный CRUD-сервис.

Один сервис для всех моделей. Работает через реестр — находит модель
по table_key, применяет метаданные из table_columns, вызывает хуки
модели, использует validation_rules.

Исключения:
    - NotFoundError — таблица или запись не найдена
    - ValidationError — данные не прошли валидацию
    - ConflictError — конфликт (уникальность, ссылки)
"""

from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import or_, and_, func

from backend.models import db, Table, TableColumn, ColumnType, ColumnValue, ValidationRule
from backend.models.registry import get_model
from backend.exceptions import CrudError, ValidationError, NotFoundError, ConflictError
from backend.services.validators import get_validator, is_empty


class CrudService:
    """Универсальный CRUD для любой модели из реестра."""

    # ============================================================
    # ПУБЛИЧНЫЕ МЕТОДЫ
    # ============================================================

    @staticmethod
    def get(table_key, row_id):
        """
        Получить запись по ID.

        :param table_key: имя таблицы.
        :param row_id: ID записи.
        :return: dict.
        :raises NotFoundError: таблица или запись не найдена.
        """
        model, table = CrudService._resolve(table_key)
        instance = db.session.get(model, row_id)
        if not instance:
            raise NotFoundError(f'Запись #{row_id} не найдена в {table_key}')

        return CrudService._serialize(instance, table)

    @staticmethod
    def list(table_key, params=None, user_id=None):
        """
        Получить список записей с фильтрами, сортировкой, пагинацией.

        :param table_key: имя таблицы.
        :param params: dict с ключами:
            - page (int, default 1)
            - per_page (int, default 50)
            - filters (dict {column: [values]})
            - sort (list of {key, direction})
            - include_deleted (bool, default False)
        :param user_id: не используется пока, для будущего аудита.
        :return: {'data': [...], 'meta': {...}}.
        :raises NotFoundError: таблица не найдена.
        """
        model, table = CrudService._resolve(table_key)

        params = params or {}
        page = int(params.get('page', 1))
        per_page = int(params.get('per_page', 50))
        filters = params.get('filters') or {}
        sort = params.get('sort') or []
        include_deleted = bool(params.get('include_deleted', False))

        query = db.session.query(model)

        # ---------- Фильтр по is_deleted ----------
        is_deleted_explicit = 'is_deleted' in filters

        if is_deleted_explicit:
            values = filters['is_deleted']
            bool_values = [CrudService._to_bool(v) for v in values]
            query = query.filter(model.is_deleted.in_(bool_values))
        elif not include_deleted:
            query = query.filter(model.is_deleted == False)

        # ---------- Фильтры по столбцам ----------
        for column_key, values in filters.items():
            if column_key == 'is_deleted':
                continue  # уже обработали
            if not values:
                continue
            if not hasattr(model, column_key):
                continue

            col = getattr(model, column_key)
            query = query.filter(col.in_(values))

        # ---------- Сортировка ----------
        if sort:
            order_by = []
            for item in sort:
                key = item.get('key')
                direction = item.get('direction', 'asc')
                if not key or not hasattr(model, key):
                    continue
                col = getattr(model, key)
                if direction == 'desc':
                    order_by.append(col.desc())
                else:
                    order_by.append(col.asc())
            if order_by:
                query = query.order_by(*order_by)
        else:
            # дефолт — по id
            query = query.order_by(model.id)

        # ---------- Пагинация ----------
        total = query.count()
        pages = (total + per_page - 1) // per_page if per_page > 0 else 1
        offset = (page - 1) * per_page
        items = query.limit(per_page).offset(offset).all()

        data = [CrudService._serialize(item, table) for item in items]

        return {
            'data': data,
            'meta': {
                'total': total,
                'page': page,
                'per_page': per_page,
                'pages': pages,
            }
        }

    # ============================================================
    # ВНУТРЕННИЕ ВСПОМОГАТЕЛЬНЫЕ
    # ============================================================

    @staticmethod
    def _resolve(table_key):
        """
        Найти модель и Table по table_key.

        :raises NotFoundError
        """
        model = get_model(table_key)
        if not model:
            raise NotFoundError(f'Модель для таблицы "{table_key}" не найдена')

        table = Table.query.filter_by(table_key=table_key, is_active=True).first()
        if not table:
            raise NotFoundError(f'Таблица "{table_key}" не найдена в метаданных')

        return model, table

    @staticmethod
    def _get_columns(table):
        """Получить все метаданные столбцов таблицы, сгруппированные по column_key."""
        columns = table.columns.all()
        result = {}
        for col in columns:
            result[col.column_key] = col
        return result

    @staticmethod
    def _serialize(instance, table=None):
        """
        Сериализовать запись + добавить отформатированные значения статусов.
        """
        row = instance.to_dict()

        if table:
            columns = table.columns.all()
            for col in columns:
                if not col.column_type:
                    continue
                if col.column_type.type_key == 'status':
                    mapping = col.get_value_mapping(row.get(col.column_key))
                    if mapping:
                        row[f'{col.column_key}_formatted'] = {
                            'label': mapping.value_label,
                            'color': mapping.value_color,
                            'icon': mapping.value_icon,
                            'row_styles': mapping.row_styles or {},
                        }
        return row

    @staticmethod
    def _to_bool(value):
        """Привести значение к bool."""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'да')
        return bool(value)

    # ============================================================
    # МЕТОДЫ БУДУТ ДОБАВЛЕНЫ В ЧАСТИ 2:
    #   _validate_fields
    #   _coerce_value
    #   _check_rules
    #   _set_audit
    #   _apply_status_sync
    #   create
    #   update
    #   soft_delete
    #   restore
    #   hard_delete
    # ============================================================
