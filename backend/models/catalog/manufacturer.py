"""
Справочник производителей.

Специфичные поля: name, status, comment.
Общие поля (id, created_at, updated_at, created_by, updated_by,
is_deleted, deleted_at, deleted_by) — в BaseModel.
"""

from backend.models import db
from backend.models.base import BaseModel


class Manufacturer(BaseModel):
    __tablename__ = 'manufacturers'

    name = db.Column(db.String(255), nullable=False, unique=True)
    status = db.Column(db.String(20), nullable=True)
    comment = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f'<Manufacturer {self.name}>'