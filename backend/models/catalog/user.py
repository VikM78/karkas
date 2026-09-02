from datetime import datetime
from backend.models import db
from backend.models.base import BaseModel
import bcrypt


class User(BaseModel):
    __tablename__ = 'users'

    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    full_name = db.Column(db.String(200))
    role = db.Column(db.String(20), default='viewer')
    is_active = db.Column(db.Boolean, default=True)
    last_login = db.Column(db.DateTime)

    def set_password(self, password):
        """Установить пароль (хеширование)"""
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    def check_password(self, password):
        """Проверить пароль"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def to_dict(self, exclude=None):
        exclude = exclude or []
        exclude.append('password_hash')
        return super().to_dict(exclude=exclude)

    def __repr__(self):
        return f'<User {self.username} ({self.role})>'