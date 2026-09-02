from backend.models import db
from backend.models.base import BaseModel


class ColumnValue(BaseModel):
    __tablename__ = 'column_value_mappings'

    column_id = db.Column(db.Integer, db.ForeignKey('table_columns.id', ondelete='CASCADE'), nullable=False)
    value_key = db.Column(db.String(100), nullable=False)
    value_label = db.Column(db.String(200), nullable=False)
    value_color = db.Column(db.String(20))
    value_icon = db.Column(db.String(50))
    sort_order = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.UniqueConstraint('column_id', 'value_key', name='uq_column_value'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.value_key,
            'label': self.value_label,
            'color': self.value_color,
            'icon': self.value_icon,
            'sort_order': self.sort_order,
            'is_active': self.is_active,
        }

    def __repr__(self):
        return f'<ColumnValue {self.value_key}>'