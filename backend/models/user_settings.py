from backend.models import db
from backend.models.base import BaseModel


class UserTableSetting(BaseModel):
    __tablename__ = 'user_table_settings'

    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    table_id = db.Column(db.Integer, db.ForeignKey('tables.id', ondelete='CASCADE'), nullable=False)
    settings = db.Column(db.JSON, nullable=False, default={})

    __table_args__ = (
        db.UniqueConstraint('user_id', 'table_id', name='uq_user_table'),
    )

    def get_visible_columns(self, default_columns=None):
        """Получить список видимых столбцов"""
        visible = self.settings.get('visible', [])
        if not visible and default_columns:
            visible = [col.column_key for col in default_columns if col.is_visible]
        return visible

    def get_column_width(self, column_key, default_width=150):
        """Получить ширину столбца"""
        widths = self.settings.get('widths', {})
        return widths.get(column_key, default_width)

    def get_column_label(self, column_key, default_label):
        """Получить пользовательское название столбца"""
        labels = self.settings.get('labels', {})
        return labels.get(column_key, default_label)

    def get_sort(self):
        """Получить настройки сортировки"""
        return self.settings.get('sort', {})

    def get_filters(self):
        """Получить настройки фильтров"""
        return self.settings.get('filters', {})

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'table_id': self.table_id,
            'settings': self.settings,
        }

    def __repr__(self):
        return f'<UserTableSetting user={self.user_id} table={self.table_id}>'