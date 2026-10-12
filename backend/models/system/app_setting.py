"""
Глобальные настройки приложения.

Key-value хранилище для параметров, которые могут меняться
без перезапуска (например, базовый размер шрифта).
"""

from backend.models import db
from backend.models.base import BaseModel


class AppSetting(BaseModel):
    __tablename__ = 'app_settings'

    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    value = db.Column(db.Text, nullable=True)
    description = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value,
            'description': self.description,
        }

    def __repr__(self):
        return f'<AppSetting {self.key}={self.value}>'