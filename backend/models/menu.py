from backend.models import db
from backend.models.base import BaseModel


class MenuItem(BaseModel):
    __tablename__ = 'menu_items'

    parent_id = db.Column(db.Integer, db.ForeignKey('menu_items.id', ondelete='CASCADE'), nullable=True)
    menu_key = db.Column(db.String(100), unique=True, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    icon = db.Column(db.String(50), nullable=True)
    url = db.Column(db.String(500), nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    is_divider = db.Column(db.Boolean, default=False)
    is_group = db.Column(db.Boolean, default=False)
    group_key = db.Column(db.String(100), nullable=True)
    group_title = db.Column(db.String(200), nullable=True)

    # Связи
    children = db.relationship(
        'MenuItem',
        backref=db.backref('parent', remote_side='MenuItem.id'),
        lazy='dynamic',
        order_by='MenuItem.sort_order'
    )
    permissions = db.relationship('MenuPermission', backref='menu', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self, include_children=False):
        data = {
            'key': self.menu_key,
            'title': self.title,
            'icon': self.icon,
            'url': self.url,
            'is_group': self.is_group,
            'is_divider': self.is_divider,
            'group_key': self.group_key,
            'group_title': self.group_title,
            'sort_order': self.sort_order,
        }
        if include_children:
            data['children'] = [child.to_dict() for child in self.children.filter_by(is_active=True).all()]
        return data

    def __repr__(self):
        return f'<MenuItem {self.menu_key}>'


class MenuPermission(BaseModel):
    __tablename__ = 'menu_permissions'

    menu_id = db.Column(db.Integer, db.ForeignKey('menu_items.id', ondelete='CASCADE'), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    is_allowed = db.Column(db.Boolean, default=False)

    __table_args__ = (
        db.UniqueConstraint('menu_id', 'role', name='uq_menu_permission'),
    )

    def to_dict(self):
        return {
            'role': self.role,
            'is_allowed': self.is_allowed,
        }

    def __repr__(self):
        return f'<MenuPermission menu={self.menu_id} role={self.role}>'


class UserMenuSettings(BaseModel):
    __tablename__ = 'user_menu_settings'

    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True)
    settings = db.Column(db.JSON, nullable=False, default={})

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'settings': self.settings,
        }

    def __repr__(self):
        return f'<UserMenuSettings user={self.user_id}>'