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

from backend.models import (
    db, Table, TableColumn, ColumnType, ColumnValue, ValidationRule
)
from backend.models.registry import get_model
from backend.exceptions import (
    CrudError, ValidationError, NotFoundError, ConflictError
)
from backend.services.validators import get_validator, is_empty


class CrudService:
    """Универсальный CRUD для любой модели из реестра."""

    # ============================================================
    # ПУБЛИЧНЫЕ МЕТОДЫ: ЧТЕНИЕ
    # ============================================================

    @staticmethod
    def get(table_key, row_id):
        """
        Получить запись по ID.

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

        :param params: dict:
            - page (int, default 1)
            - per_page (int, default 50)
            - filters (dict {column: [values]})
            - sort (list of {key, direction})
            - include_deleted (bool, default False)
        :return: {'data': [...], 'meta': {...}}.
        :raises NotFoundError
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
                continue
            if not values:
                continue
            if not hasattr(model, column_key):
                continue

            col = getattr(model, column_key)

            # Особый случай: фильтр по NULL (для status)
            # Если в values есть специальный маркер '__null__' — фильтруем по IS NULL
            if '__null__' in values:
                non_null = [v for v in values if v != '__null__']
                if non_null:
                    query = query.filter(
                        or_(col.is_(None), col.in_(non_null))
                    )
                else:
                    query = query.filter(col.is_(None))
            else:
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
                natural_key = func.natural_sort_key(col)

                if direction == 'desc':
                    order_by.append(natural_key.desc())
                else:
                    order_by.append(natural_key.asc())

            if order_by:
                query = query.order_by(*order_by)
        else:
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
    # ПУБЛИЧНЫЕ МЕТОДЫ: ЗАПИСЬ
    # ============================================================

    @staticmethod
    def create(table_key, data, user_id=None):
        """
        Создать запись.

        :raises NotFoundError, ValidationError, ConflictError.
        """
        model, table = CrudService._resolve(table_key)

        if not isinstance(data, dict):
            raise ValidationError('Данные должны быть объектом')

        # 1. Фильтрация + валидация + приведение типов
        clean_data = CrudService._validate_fields(data, table, model, row_id=None)

        # 2. Проверка правил validation_rules
        CrudService._check_rules(clean_data, table_key, row_id=None)

        # 3. Создать instance
        instance = model()
        for key, value in clean_data.items():
            setattr(instance, key, value)

        # 4. Аудит
        CrudService._set_audit(instance, user_id, mode='create')

        # 5. Хук модели
        if hasattr(instance, 'before_save'):
            instance.before_save(clean_data)

        # 6. Сохранить
        try:
            db.session.add(instance)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise ConflictError(f'Ошибка сохранения: {e}')

        # 7. Пост-хук
        if hasattr(instance, 'after_save'):
            instance.after_save()

        return CrudService._serialize(instance, table)

    @staticmethod
    def update(table_key, row_id, data, user_id=None):
        """
        Обновить запись.

        :raises NotFoundError, ValidationError, ConflictError.
        """
        model, table = CrudService._resolve(table_key)

        instance = db.session.get(model, row_id)
        if not instance:
            raise NotFoundError(f'Запись #{row_id} не найдена в {table_key}')

        if not isinstance(data, dict):
            raise ValidationError('Данные должны быть объектом')

        # 1. Фильтрация + валидация + приведение типов
        clean_data = CrudService._validate_fields(data, table, model, row_id=row_id)

        # 2. Проверка правил validation_rules
        CrudService._check_rules(clean_data, table_key, row_id=row_id)

        # 3. Применить поля
        for key, value in clean_data.items():
            setattr(instance, key, value)

        # 4. Аудит
        CrudService._set_audit(instance, user_id, mode='update')

        # 5. Хук модели
        if hasattr(instance, 'before_save'):
            instance.before_save(clean_data)

        # 6. Сохранить
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise ConflictError(f'Ошибка сохранения: {e}')

        # 7. Пост-хук
        if hasattr(instance, 'after_save'):
            instance.after_save()

        return CrudService._serialize(instance, table)

    @staticmethod
    def soft_delete(table_key, row_id, user_id=None):
        """
        Пометить на удаление (мягкое удаление).

        :raises NotFoundError, ConflictError.
        """
        model, table = CrudService._resolve(table_key)

        instance = db.session.get(model, row_id)
        if not instance:
            raise NotFoundError(f'Запись #{row_id} не найдена в {table_key}')

        # 1. Хук can_delete
        if hasattr(instance, 'can_delete'):
            allowed, reason = instance.can_delete()
            if not allowed:
                raise ConflictError(reason or 'Удаление запрещено')

        # 2. Проверка правил no_references (если есть)
        CrudService._check_no_references(table_key, row_id)

        # 3. Пометить
        instance.is_deleted = True
        instance.deleted_at = datetime.utcnow()
        if user_id is not None:
            instance.deleted_by = user_id
            instance.updated_by = user_id

        # 4. Сохранить
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise ConflictError(f'Ошибка удаления: {e}')

        return CrudService._serialize(instance, table)

    @staticmethod
    def restore(table_key, row_id, user_id=None):
        """
        Снять пометку на удаление.

        :raises NotFoundError.
        """
        model, table = CrudService._resolve(table_key)

        instance = db.session.get(model, row_id)
        if not instance:
            raise NotFoundError(f'Запись #{row_id} не найдена в {table_key}')

        instance.is_deleted = False
        instance.deleted_at = None
        instance.deleted_by = None
        if user_id is not None:
            instance.updated_by = user_id

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise ConflictError(f'Ошибка восстановления: {e}')

        return CrudService._serialize(instance, table)

    @staticmethod
    def hard_delete(table_key, row_id, user_id=None):
        """
        Полное удаление из БД.

        Использовать только в монопольном режиме.
        :raises NotFoundError, ConflictError.
        """
        model, table = CrudService._resolve(table_key)

        instance = db.session.get(model, row_id)
        if not instance:
            raise NotFoundError(f'Запись #{row_id} не найдена в {table_key}')

        # 1. Хук can_delete
        if hasattr(instance, 'can_delete'):
            allowed, reason = instance.can_delete()
            if not allowed:
                raise ConflictError(reason or 'Удаление запрещено')

        # 2. Проверка правил no_references
        CrudService._check_no_references(table_key, row_id)

        # 3. Удалить физически
        try:
            db.session.delete(instance)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise ConflictError(f'Ошибка удаления: {e}')

        return {'id': row_id, 'deleted': True}

    # ============================================================
    # ВНУТРЕННИЕ: RESOLVE, SERIALIZE
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
                    value = row.get(col.column_key)
                    if value is not None:
                        mapping = col.get_value_mapping(value)
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
    # ВНУТРЕННИЕ: ВАЛИДАЦИЯ ПОЛЕЙ
    # ============================================================

    @staticmethod
    def _validate_fields(data, table, model, row_id=None):
        """
        Отфильтровать data по метаданным, проверить обязательные,
        привести типы.

        Обязательность:
            - из модели: nullable=False, без default, не PK → обязательно.
            - из метаданных: is_required=True → обязательно (для UI-подсказок).
        
        Приоритет: модель ИЛИ метаданные.

        :param data: dict с входными данными.
        :param table: Table — метаданные таблицы.
        :param model: класс SQLAlchemy-модели.
        :param row_id: id существующей записи (для update) или None (для create).
        :return: dict — очищенные данные.
        :raises ValidationError
        """
        columns = {c.column_key: c for c in table.columns.all()}

        # Колонки модели — для проверки nullable
        model_columns = {c.name: c for c in model.__table__.columns}

        clean = {}

        for key, value in data.items():
            col = columns.get(key)

            # Поля, которых нет в метаданных — игнорируем
            if not col:
                continue

            # Поля, недоступные для редактирования — игнорируем
            if not col.is_editable:
                continue

            # Приведение типа
            coerced = CrudService._coerce_value(value, col)

            # Обязательность: метаданные ИЛИ модель
            is_required = col.is_required

            model_col = model_columns.get(key)
            if model_col is not None:
                if not model_col.nullable and model_col.default is None and not model_col.primary_key:
                    is_required = True

            if is_required and is_empty(coerced):
                raise ValidationError(
                    f'Поле "{col.column_label}" обязательно',
                    field=key,
                )

            # Проверка enum (status)
            if col.column_type and col.column_type.type_key == 'status':
                if not is_empty(coerced):
                    mapping = col.get_value_mapping(coerced)
                    if not mapping:
                        raise ValidationError(
                            f'Недопустимое значение для "{col.column_label}": {coerced}',
                            field=key,
                        )

            clean[key] = coerced

        return clean
        
    @staticmethod
    def _coerce_value(value, col):
        """
        Привести значение к типу столбца.

        :param value: входное значение.
        :param col: TableColumn.
        :return: приведённое значение или исходное.
        """
        if value is None:
            return None

        type_key = col.column_type.type_key if col.column_type else 'string'

        try:
            if type_key in ('int', 'row_number'):
                if value == '':
                    return None
                return int(value)

            if type_key in ('numeric', 'currency', 'percent'):
                if value == '':
                    return None
                return Decimal(str(value))

            if type_key == 'boolean':
                return CrudService._to_bool(value)

            if type_key == 'date':
                if isinstance(value, str) and value:
                    return date.fromisoformat(value[:10])
                return value

            if type_key in ('datetime', 'time'):
                if isinstance(value, str) and value:
                    return datetime.fromisoformat(value.replace('Z', '+00:00'))
                return value

            # string, text, status, email, phone, url, foreign_key
            if isinstance(value, str):
                return value.strip() or None
            return value

        except (ValueError, TypeError) as e:
            raise ValidationError(
                f'Неверный формат для "{col.column_label}": {e}',
                field=col.column_key,
            )

    # ============================================================
    # ВНУТРЕННИЕ: ПРАВИЛА ВАЛИДАЦИИ
    # ============================================================

    @staticmethod
    def _check_rules(data, table_key, row_id=None):
        """
        Применить validation_rules для таблицы.

        :raises ValidationError
        """
        rules = ValidationRule.query.filter_by(
            table_key=table_key,
            is_active=True,
        ).filter(
            ValidationRule.is_deleted == False,
        ).order_by(ValidationRule.sort_order).all()

        if not rules:
            return

        for rule in rules:
            validator = get_validator(rule.rule_type)
            if not validator:
                continue

            # Правило может быть для конкретного поля или для всей строки
            if rule.column_key:
                value = data.get(rule.column_key)
            else:
                value = None  # строка — value не нужен

            context = {
                'table_key': table_key,
                'column_key': rule.column_key,
                'exclude_id': row_id,
                'row_id': row_id,
            }

            ok, error = validator(value, rule.rule_params or {}, context)
            if not ok:
                raise ValidationError(
                    error or rule.error_message,
                    field=rule.column_key,
                )

    @staticmethod
    def _check_no_references(table_key, row_id):
        """
        Проверить правила no_references при удалении.

        :raises ConflictError
        """
        rules = ValidationRule.query.filter_by(
            table_key=table_key,
            rule_type='no_references',
            is_active=True,
        ).filter(
            ValidationRule.is_deleted == False,
        ).all()

        if not rules:
            return

        validator = get_validator('no_references')
        for rule in rules:
            context = {
                'table_key': table_key,
                'row_id': row_id,
            }
            ok, error = validator(row_id, rule.rule_params or {}, context)
            if not ok:
                raise ConflictError(error or rule.error_message)

    # ============================================================
    # ВНУТРЕННИЕ: АУДИТ
    # ============================================================

    @staticmethod
    def _set_audit(instance, user_id, mode='update'):
        """
        Проставить аудит-поля.

        :param mode: 'create' или 'update'.
        """
        if user_id is None:
            return

        if mode == 'create' and hasattr(instance, 'created_by'):
            instance.created_by = user_id

        if hasattr(instance, 'updated_by'):
            instance.updated_by = user_id