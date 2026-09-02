from backend.models import db
from backend.models.base import BaseModel


class ColumnType(BaseModel):
    __tablename__ = 'column_types'

    type_key = db.Column(db.String(50), unique=True, nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), default='basic')
    format_template = db.Column(db.String(200))
    is_numeric = db.Column(db.Boolean, default=False)
    sort_order = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.type_key,
            'name': self.display_name,
            'category': self.category,
            'format': self.format_template,
            'is_numeric': self.is_numeric,
        }

    def __repr__(self):
        return f'<ColumnType {self.type_key}>'