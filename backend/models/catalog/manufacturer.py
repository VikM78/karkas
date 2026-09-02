from backend.models import db
from backend.models.base import BaseModel
from datetime import datetime


class Manufacturer(BaseModel):
    __tablename__ = 'manufacturers'

    name = db.Column(db.String(255), nullable=False, unique=True)
    status = db.Column(db.String(20), default='active')
    comment = db.Column(db.Text, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.String(100), nullable=True)

    def to_dict(self, exclude=None):
        exclude = exclude or []
        data = super().to_dict(exclude=exclude)
        return data

    def __repr__(self):
        return f'<Manufacturer {self.name}>'