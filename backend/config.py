# start_my_file backend/config.py
import os
import base64
from pathlib import Path
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def decrypt_env_file(enc_file, password=None, salt_file=None):
    """Расшифровать .env файл и загрузить в os.environ"""
    enc_file = Path(enc_file)
    if not enc_file.exists():
        return False

    password = password or os.getenv('ENV_ENCRYPT_KEY')
    if not password:
        print("⚠️ ENV_ENCRYPT_KEY не установлен! Использую .env напрямую")
        return False

    # Соль для ключа
    salt_file = Path(salt_file or '.secrets/.salt')
    if salt_file.exists():
        salt = salt_file.read_bytes()
    else:
        salt = os.urandom(16)
        salt_file.parent.mkdir(parents=True, exist_ok=True)
        salt_file.write_bytes(salt)

    # Генерируем ключ
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    fernet = Fernet(key)

    # Расшифровываем
    with open(enc_file, 'rb') as f:
        encrypted = f.read()

    try:
        decrypted = fernet.decrypt(encrypted)
        # Загружаем в os.environ
        env_content = decrypted.decode('utf-8')
        for line in env_content.splitlines():
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()
        return True
    except Exception as e:
        print(f"❌ Ошибка расшифровки: {e}")
        return False


# Пытаемся загрузить зашифрованный .env
if not decrypt_env_file('.env.enc'):
    # Если не получилось — пробуем обычный .env
    load_dotenv()
    load_dotenv('.secrets/.env')



class Config:
    # ===== PostgreSQL =====
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '5432')
    DB_NAME = os.getenv('DB_NAME', 'karkas')
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_SSLMODE = os.getenv('DB_SSLMODE', 'disable')

    # SSL сертификаты (для продакшена)
    DB_SSL_CERT = os.getenv('DB_SSL_CERT', '')
    DB_SSL_KEY = os.getenv('DB_SSL_KEY', '')
    DB_SSL_CA = os.getenv('DB_SSL_CA', '')

    # ===== Flask =====
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    HOST = os.getenv('FLASK_HOST', '0.0.0.0')
    PORT = int(os.getenv('FLASK_PORT', 5000))

    # ===== JWT =====
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key')
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', 3600))
    JWT_REFRESH_TOKEN_EXPIRES = int(os.getenv('JWT_REFRESH_TOKEN_EXPIRES', 604800))

    # ===== CORS =====
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')

    # ===== Admin =====
    ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')
    ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@local')
    ADMIN_FULL_NAME = os.getenv('ADMIN_FULL_NAME', 'Administrator')

    # ===== Настройки приложения =====
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    DELETE_MODE = os.getenv('DELETE_MODE', 'soft')

    @property
    def sqlalchemy_dsn(self) -> str:
        """DSN для SQLAlchemy"""
        ssl_params = f"sslmode={self.DB_SSLMODE}"
        if self.DB_SSLMODE == 'verify-full':
            if self.DB_SSL_CA:
                ssl_params += f"&sslrootcert={self.DB_SSL_CA}"
            if self.DB_SSL_CERT:
                ssl_params += f"&sslcert={self.DB_SSL_CERT}"
            if self.DB_SSL_KEY:
                ssl_params += f"&sslkey={self.DB_SSL_KEY}"

        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?{ssl_params}"
        )

    @property
    def pg_dsn(self) -> str:
        """DSN для psycopg2"""
        return (
            f"dbname={self.DB_NAME} user={self.DB_USER} "
            f"password={self.DB_PASSWORD} host={self.DB_HOST} "
            f"port={self.DB_PORT} sslmode={self.DB_SSLMODE}"
        )


config = Config()
# end_my_file backend/config.py