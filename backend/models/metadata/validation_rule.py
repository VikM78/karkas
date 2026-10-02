"""
Правила валидации полей.

Используется CrudService для проверки данных перед сохранением.
Правила хранятся отдельно от структуры таблицы — можно менять
без миграции.
"""

from backend.models import db
from backend.models.base import BaseModel


class ValidationRule(BaseModel):
    __tablename__ = 'validation_rules'

    # К чему привязано правило
    table_key = db.Column(db.String(100), nullable=False, index=True)
    column_key = db.Column(db.String(100), nullable=True, index=True)  # NULL = правило для всей строки

    # Тип и параметры
    rule_type = db.Column(db.String(50), nullable=False)
    rule_params = db.Column(db.JSON, nullable=True)
    error_message = db.Column(db.String(500), nullable=False)

    # Управление
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    sort_order = db.Column(db.Integer, default=0)

    __table_args__ = (
        db.Index('ix_validation_rules_table_column', 'table_key', 'column_key'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'table_key': self.table_key,
            'column_key': self.column_key,
            'rule_type': self.rule_type,
            'rule_params': self.rule_params,
            'error_message': self.error_message,
            'is_active': self.is_active,
            'sort_order': self.sort_order,
        }

    def __repr__(self):
        return f'<ValidationRule {self.table_key}.{self.column_key} ({self.rule_type})>'