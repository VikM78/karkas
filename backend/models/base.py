from datetime import datetime
from backend.models import db


class BaseModel(db.Model):
    """Базовая модель с общими полями"""
    __abstract__ = True

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, exclude=None):
        """Преобразование в dict"""
        exclude = exclude or []
        result = {}
        for column in self.__table__.columns:
            if column.name in exclude:
                continue
            value = getattr(self, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            result[column.name] = value
        return result

    def save(self):
        """Сохранить в БД"""
        db.session.add(self)
        db.session.commit()
        return self

    def delete(self):
        """Удалить из БД"""
        db.session.delete(self)
        db.session.commit()