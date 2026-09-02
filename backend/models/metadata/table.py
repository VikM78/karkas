from backend.models import db
from backend.models.base import BaseModel


class Table(BaseModel):
    __tablename__ = 'tables'

    table_key = db.Column(db.String(100), unique=True, nullable=False)
    table_name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    icon = db.Column(db.String(50))
    model_name = db.Column(db.String(200))
    is_active = db.Column(db.Boolean, default=True)

    # Связи
    columns = db.relationship('TableColumn', backref='table', lazy='dynamic',
                              cascade='all, delete-orphan', order_by='TableColumn.sort_order')

    settings = db.relationship('UserTableSetting', backref='table', lazy='dynamic',
                               cascade='all, delete-orphan')

    def get_column(self, key):
        """Получить столбец по ключу"""
        return self.columns.filter_by(column_key=key).first()

    def get_visible_columns(self):
        """Получить видимые столбцы"""
        return self.columns.filter_by(is_visible=True).all()

    def to_dict(self, include_columns=False):
        data = {
            'id': self.id,
            'key': self.table_key,
            'name': self.table_name,
            'description': self.description,
            'icon': self.icon,
            'model_name': self.model_name,
            'is_active': self.is_active,
        }
        if include_columns:
            data['columns'] = [col.to_dict() for col in self.columns.all()]
        return data

    def __repr__(self):
        return f'<Table {self.table_key}>'