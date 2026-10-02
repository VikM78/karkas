"""
Базовая модель с общими полями.

Все модели проекта наследуются от BaseModel.
Поля created_by, updated_by, is_deleted и т.д. — общие для всех.
Хуки before_save, after_save, can_delete — опциональны, вызываются CrudService.
"""

from datetime import datetime, date
from decimal import Decimal
from backend.models import db


class BaseModel(db.Model):
    """Базовая модель с общими полями."""

    __abstract__ = True

    # ============================================================
    # ИДЕНТИФИКАЦИЯ И ВРЕМЕННЫЕ МЕТКИ
    # ============================================================
    id = db.Column(db.Integer, primary_key=True)

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    # ============================================================
    # АУДИТ (кто создал / изменил)
    # ============================================================
    created_by = db.Column(
        db.Integer,
        nullable=True
    )
    updated_by = db.Column(
        db.Integer,
        nullable=True
    )

    # ============================================================
    # МЯГКОЕ УДАЛЕНИЕ
    # ============================================================
    is_deleted = db.Column(
        db.Boolean,
        default=False,
        nullable=False,
        index=True
    )
    deleted_at = db.Column(
        db.DateTime,
        nullable=True
    )
    deleted_by = db.Column(
        db.Integer,
        nullable=True
    )

    # ============================================================
    # ХУКИ (опциональны, вызываются CrudService)
    # ============================================================
    def before_save(self, data):
        """
        Хук: вызвать перед сохранением (create или update).

        По умолчанию ничего не делает.
        Переопределить в модели при необходимости.

        :param data: dict с входящими данными.
        :return: dict (может быть трансформирован).
        """
        return data

    def after_save(self):
        """
        Хук: вызвать после сохранения.

        По умолчанию ничего не делает.
        """
        pass

    def can_delete(self):
        """
        Хук: проверить, можно ли удалить запись.

        По умолчанию разрешает.
        Переопределить в модели для специфичной логики.

        :return: (bool, str) — можно ли, причина отказа.
        """
        return True, None

    # ============================================================
    # МЕТОДЫ МЯГКОГО УДАЛЕНИЯ
    # ============================================================
    def soft_delete(self, user_id=None):
        """
        Пометить на удаление (мягкое удаление).

        Не трогает status — статус остаётся как есть.
        Синхронизация status='deleted' — на стороне CrudService.
        """
        self.is_deleted = True
        self.deleted_at = datetime.utcnow()
        if user_id is not None:
            self.deleted_by = user_id
        return self

    def restore(self, user_id=None):
        """Снять пометку на удаление."""
        self.is_deleted = False
        self.deleted_at = None
        self.deleted_by = None
        if user_id is not None:
            self.updated_by = user_id
        return self

    # ============================================================
    # СЕРИАЛИЗАЦИЯ
    # ============================================================
    def to_dict(self, exclude=None):
        """
        Преобразование в dict.

        Обрабатывает типы:
        - datetime / date → ISO-строка
        - Decimal → float
        - прочее → как есть
        """
        exclude = exclude or []
        result = {}
        for column in self.__table__.columns:
            if column.name in exclude:
                continue
            value = getattr(self, column.name)
            result[column.name] = self._serialize_value(value)
        return result

    @staticmethod
    def _serialize_value(value):
        """Привести значение к JSON-совместимому виду."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        return value

    # ============================================================
    # СОХРАНЕНИЕ / УДАЛЕНИЕ
    # ============================================================
    def save(self):
        """Сохранить в БД (низкоуровневый метод)."""
        db.session.add(self)
        db.session.commit()
        return self

    def hard_delete(self):
        """
        Полное удаление из БД (без возможности восстановления).

        Использовать только в монопольном режиме — после проверки ссылок.
        """
        db.session.delete(self)
        db.session.commit()