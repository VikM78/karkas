from backend.models import db
from backend.models.base import BaseModel


class TableColumn(BaseModel):
    __tablename__ = 'table_columns'

    table_id = db.Column(db.Integer, db.ForeignKey('tables.id', ondelete='CASCADE'), nullable=False)
    column_key = db.Column(db.String(100), nullable=False)
    column_label = db.Column(db.String(200), nullable=False)
    column_type_id = db.Column(db.Integer, db.ForeignKey('column_types.id'))
    is_visible = db.Column(db.Boolean, default=True)
    is_sortable = db.Column(db.Boolean, default=True)
    is_filterable = db.Column(db.Boolean, default=True)
    default_width = db.Column(db.Integer, default=150)
    min_width = db.Column(db.Integer, default=50)
    max_width = db.Column(db.Integer, default=500)
    sort_order = db.Column(db.Integer, default=0)
    is_fixed = db.Column(db.Boolean, default=False)
    is_row_number = db.Column(db.Boolean, default=False)
    is_editable = db.Column(db.Boolean, default=True)
    is_required = db.Column(db.Boolean, default=False)

    # Связи
    column_type = db.relationship('ColumnType', backref='columns')
    values = db.relationship('ColumnValue', backref='column', lazy='dynamic',
                             cascade='all, delete-orphan', order_by='ColumnValue.sort_order')

    __table_args__ = (
        db.UniqueConstraint('table_id', 'column_key', name='uq_table_column'),
    )

    def get_value_mapping(self, value_key):
        """Получить значение из справочника"""
        return self.values.filter_by(value_key=value_key).first()

    def get_label_for_value(self, value_key):
        """Получить отображаемое значение из справочника"""
        mapping = self.get_value_mapping(value_key)
        return mapping.value_label if mapping else value_key

    def to_dict(self, include_values=False):
        data = {
            'id': self.id,
            'key': self.column_key,
            'label': self.column_label,
            'type': self.column_type.type_key if self.column_type else 'string',
            'type_name': self.column_type.display_name if self.column_type else 'Текст',
            'visible': self.is_visible,
            'sortable': self.is_sortable,
            'filterable': self.is_filterable,
            'width': self.default_width,
            'min_width': self.min_width,
            'max_width': self.max_width,
            'sort_order': self.sort_order,
            'fixed': self.is_fixed,
            'row_number': self.is_row_number,
            'editable': self.is_editable,
            'required': self.is_required,
        }
        if include_values and self.column_type and self.column_type.type_key == 'status':
            data['values'] = [v.to_dict() for v in self.values.filter_by(is_active=True).all()]
        return data

    def __repr__(self):
        return f'<TableColumn {self.column_key}>'