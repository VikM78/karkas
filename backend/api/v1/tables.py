from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from backend.services.table_service import TableService
from backend.models import Manufacturer, db
from datetime import datetime

bp = Blueprint('tables', __name__, url_prefix='/api/v1/tables')


@bp.route('/<table_key>/schema', methods=['GET'])
@jwt_required()
def get_table_schema(table_key):
    """Получить схему таблицы (метаданные)"""
    user_id = get_jwt_identity()
    schema = TableService.get_table_schema(table_key, int(user_id))
    if not schema:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify(schema)


@bp.route('/<table_key>/data', methods=['GET'])
@jwt_required()
def get_table_data(table_key):
    """Получить данные таблицы"""
    user_id = get_jwt_identity()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    search = request.args.get('search', '')
    sort_key = request.args.get('sort', 'id')
    sort_direction = request.args.get('order', 'asc')

    filters = {}
    for key in request.args:
        if key.startswith('filter_'):
            column = key.replace('filter_', '')
            values = request.args.get(key, '').split(',')
            if values:
                filters[column] = values

    params = {
        'page': page,
        'per_page': per_page,
        'search': search,
        'filters': filters,
        'sort': {'key': sort_key, 'direction': sort_direction}
    }

    result = TableService.get_table_data(table_key, int(user_id), params)
    if not result:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify(result)


@bp.route('/<table_key>/settings', methods=['GET'])
@jwt_required()
def get_table_settings(table_key):
    """Получить настройки пользователя для таблицы"""
    user_id = get_jwt_identity()
    settings = TableService.get_user_settings(table_key, int(user_id))
    if settings is None:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify(settings)


@bp.route('/<table_key>/settings', methods=['POST', 'PUT'])
@jwt_required()
def save_table_settings(table_key):
    """Сохранить настройки пользователя для таблицы"""
    user_id = get_jwt_identity()
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Нет данных'}), 400
    settings = TableService.save_user_settings(table_key, int(user_id), data)
    if settings is None:
        return jsonify({'error': 'Таблица не найдена'}), 404
    return jsonify({'settings': settings})


# ============================================================
# CRUD ДЛЯ MANUFACTURERS
# ============================================================

@bp.route('/manufacturers/row', methods=['POST'])
@jwt_required()
def create_manufacturer_row():
    """Создать производителя"""
    data = request.get_json()
    user = get_jwt_identity()
    
    try:
        manufacturer = Manufacturer(
            name=data.get('name'),
            status=data.get('status', 'active'),
            comment=data.get('comment', ''),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            updated_by=user
        )
        db.session.add(manufacturer)
        db.session.commit()
        return jsonify(manufacturer.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400


@bp.route('/manufacturers/<int:id>', methods=['GET'])
@jwt_required()
def get_manufacturer(id):
    """Получить производителя по ID"""
    manufacturer = Manufacturer.query.get(id)
    if not manufacturer:
        return jsonify({'error': 'Производитель не найден'}), 404
    return jsonify(manufacturer.to_dict())


@bp.route('/manufacturers/<int:id>', methods=['PUT'])
@jwt_required()
def update_manufacturer(id):
    """Обновить производителя"""
    data = request.get_json()
    user = get_jwt_identity()
    
    manufacturer = Manufacturer.query.get(id)
    if not manufacturer:
        return jsonify({'error': 'Производитель не найден'}), 404
    
    try:
        if 'name' in data:
            manufacturer.name = data['name']
        if 'status' in data:
            manufacturer.status = data['status']
        if 'comment' in data:
            manufacturer.comment = data['comment']
        manufacturer.updated_at = datetime.utcnow()
        manufacturer.updated_by = user
        
        db.session.commit()
        return jsonify(manufacturer.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400


@bp.route('/manufacturers/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_manufacturer(id):
    """Удалить производителя (мягкое удаление)"""
    manufacturer = Manufacturer.query.get(id)
    if not manufacturer:
        return jsonify({'error': 'Производитель не найден'}), 404
    
    try:
        manufacturer.is_deleted = True
        manufacturer.deleted_at = datetime.utcnow()
        manufacturer.status = 'deleted'
        db.session.commit()
        return jsonify({'message': 'Удалён'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400


@bp.route('/manufacturers/<int:id>/restore', methods=['POST'])
@jwt_required()
def restore_manufacturer(id):
    """Восстановить производителя"""
    manufacturer = Manufacturer.query.get(id)
    if not manufacturer:
        return jsonify({'error': 'Производитель не найден'}), 404
    
    try:
        manufacturer.is_deleted = False
        manufacturer.deleted_at = None
        manufacturer.status = 'active'
        db.session.commit()
        return jsonify({'message': 'Восстановлен'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400


@bp.route('/manufacturers/<int:id>/hard', methods=['DELETE'])
@jwt_required()
def hard_delete_manufacturer(id):
    """Полное удаление производителя"""
    manufacturer = Manufacturer.query.get(id)
    if not manufacturer:
        return jsonify({'error': 'Производитель не найден'}), 404
    
    try:
        db.session.delete(manufacturer)
        db.session.commit()
        return jsonify({'message': 'Удалён навсегда'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400