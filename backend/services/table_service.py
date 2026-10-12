"""
Сервис для работы с таблицами и их метаданными.

Основные задачи:
    - get_table_schema — метаданные таблицы для фронтенда.
    - get_table_data — данные (делегирует в CrudService.list).
    - get_user_settings / save_user_settings — пользовательские настройки.

Универсальный: работает для любой таблицы из реестра моделей.
"""

from backend.models import db, Table, UserTableSetting
from backend.services.crud_service import CrudService
from backend.exceptions import NotFoundError
from datetime import datetime
from backend.services.measure import parse_measure, normalize_measure, is_normalized
from backend.services.settings_service import get_base_font_size_px


class TableService:
    """Сервис для работы с таблицами и их метаданными."""

    # ============================================================
    # ТАБЛИЦА
    # ============================================================

    @staticmethod
    def get_table_by_key(table_key):
        """Получить таблицу по ключу."""
        return Table.query.filter_by(table_key=table_key, is_active=True).first()

    # ============================================================
    # СХЕМА
    # ============================================================

    @staticmethod
    def get_table_schema(table_key, user_id=None):
        """
        Получить полную схему таблицы.

        Возвращает:
            {
                'table': {...},
                'columns': [ {column_data}, ... ],
                'settings': {...},           # настройки пользователя
                'default_settings': {...},   # дефолты из метаданных
            }
        """
        table = TableService.get_table_by_key(table_key)
        if not table:
            return None

        # Все столбцы — включая невидимые (пользователь может включить)
        all_columns = table.columns.order_by('sort_order').all()

        user_settings = None
        if user_id:
            user_settings = UserTableSetting.query.filter_by(
                user_id=user_id, table_id=table.id
            ).first()

        # Дефолтные настройки (на основе метаданных)
        base_font_px = get_base_font_size_px()

        default_settings = {
            'visible': [col.column_key for col in all_columns if col.is_visible],
            'widths': {
                col.column_key: parse_measure(col.default_width, base_font_px)
                for col in all_columns
            },
            'labels': {col.column_key: col.column_label for col in all_columns},
            'order': [col.column_key for col in all_columns],
            'sort': table.default_sort_list or [],
            'filters': {},
            'include_deleted': False,
        }

        result = {
            'table': table.to_dict(),
            'columns': [],
            'settings': user_settings.settings if user_settings else {},
            'default_settings': default_settings,
        }

        for col in all_columns:
            col_data = TableService._serialize_column(col)
            result['columns'].append(col_data)

        return result

    @staticmethod
    def _serialize_column(col):
        """
        Сериализовать один столбец метаданных для фронтенда.

        Включает:
            - ключ, метка, тип;
            - размеры (px и rem);
            - выравнивание;
            - флаги (visible, editable, required, multiline, ...);
            - null_label — для отображения «пустого» значения в фильтре;
            - values — для столбцов типа status (со всеми стилями).
        """
        col_data = col.to_dict(include_values=True)

        # null_label из типа столбца
        if col.column_type:
            col_data['null_label'] = col.column_type.null_label

        # Ленивая нормализация — если значение без единицы
        changed = False
        for field in ('default_width', 'min_width', 'max_width'):
            value = getattr(col, field, None)
            if value is not None and not is_normalized(value):
                normalized = normalize_measure(value)
                if normalized and normalized != value:
                    setattr(col, field, normalized)
                    changed = True

        if changed:
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()

        # Парсинг measure → структура {raw, value, unit, rem, px}
        base_font_px = get_base_font_size_px()
        col_data['default_width'] = parse_measure(col.default_width, base_font_px)
        col_data['min_width'] = parse_measure(col.min_width, base_font_px)
        col_data['max_width'] = parse_measure(col.max_width, base_font_px)

        # Выравнивание (с fallback на тип)
        col_data['align_h'] = col.align_h or (
            col.column_type.default_align_h if col.column_type else None
        )
        col_data['align_v'] = col.align_v or (
            col.column_type.default_align_v if col.column_type else None
        )

        # max_lines для многострочного текста
        col_data['max_lines'] = col.max_lines

        # values — только для status (уже добавлены в to_dict(include_values=True)),
        # но продублируем row_styles явно
        if col.column_type and col.column_type.type_key == 'status':
            values = col.values.filter_by(is_active=True).order_by('sort_order').all()
            col_data['values'] = [
                {
                    'key': v.value_key,
                    'label': v.value_label,
                    'color': v.value_color,
                    'icon': v.value_icon,
                    'show_icon': v.show_icon,
                    'show_in_filter': v.show_in_filter,
                    'row_styles': v.row_styles or {},
                }
                for v in values
            ]

        return col_data

    # ============================================================
    # ДАННЫЕ
    # ============================================================

    @staticmethod
    def get_table_data(table_key, user_id=None, params=None):
        """
        Получить данные таблицы.

        Делегирует в CrudService.list — единая логика для всех таблиц.
        """
        try:
            return CrudService.list(table_key, params, user_id=user_id)
        except NotFoundError:
            return None

    # ============================================================
    # НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ
    # ============================================================

    @staticmethod
    def save_user_settings(table_key, user_id, settings):
        """Сохранить настройки пользователя для таблицы."""
        table = TableService.get_table_by_key(table_key)
        if not table:
            return None

        user_setting = UserTableSetting.query.filter_by(
            user_id=user_id, table_id=table.id
        ).first()

        if user_setting:
            user_setting.settings = settings
            user_setting.updated_at = datetime.utcnow()
            user_setting.updated_by = user_id
        else:
            user_setting = UserTableSetting(
                user_id=user_id,
                table_id=table.id,
                settings=settings,
                created_by=user_id,
                updated_by=user_id,
            )
            db.session.add(user_setting)

        db.session.commit()
        return user_setting.settings

    @staticmethod
    def get_user_settings(table_key, user_id):
        """Получить настройки пользователя для таблицы."""
        table = TableService.get_table_by_key(table_key)
        if not table:
            return None

        user_setting = UserTableSetting.query.filter_by(
            user_id=user_id, table_id=table.id
        ).first()

        if user_setting and user_setting.settings:
            return user_setting.settings

        # Дефолты из метаданных
        columns = table.columns.order_by('sort_order').all()
        base_font_px = get_base_font_size_px()
        return {
            'visible': [col.column_key for col in columns if col.is_visible],
            'widths': {
                col.column_key: parse_measure(col.default_width, base_font_px)
                for col in columns
            },
            'labels': {col.column_key: col.column_label for col in columns},
            'order': [col.column_key for col in columns],
            'filters': {},
            'sort': table.default_sort_list or [],
            'include_deleted': False,
        }