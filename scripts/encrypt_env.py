# start_my_file scripts/encrypt_env.py
#!/usr/bin/env python3
"""
Шифрование/дешифрование .env файлов

Использование:
    python scripts/encrypt_env.py encrypt    # Зашифровать .secrets/.env → .env.enc
    python scripts/encrypt_env.py decrypt    # Расшифровать .env.enc → .secrets/.env
    python scripts/encrypt_env.py generate   # Сгенерировать ключ шифрования
"""

import os
import sys
import base64
import argparse
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class EnvEncryptor:
    def __init__(self, password=None):
        self.password = password or os.getenv('ENV_ENCRYPT_KEY')
        self.salt_file = Path('.secrets/.salt')
        self.env_file = Path('.secrets/.env')
        self.enc_file = Path('.env.enc')

    def _get_key(self):
        """Получить ключ шифрования из пароля"""
        if not self.password:
            raise ValueError(
                "Пароль не задан! Установите ENV_ENCRYPT_KEY или передайте --password"
            )

        # Загружаем или создаём соль
        if self.salt_file.exists():
            salt = self.salt_file.read_bytes()
        else:
            salt = os.urandom(16)
            self.salt_file.parent.mkdir(parents=True, exist_ok=True)
            self.salt_file.write_bytes(salt)

        # Генерируем ключ из пароля
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self.password.encode()))
        return key

    def encrypt(self):
        """Зашифровать .secrets/.env → .env.enc"""
        if not self.env_file.exists():
            print(f"❌ Файл {self.env_file} не найден!")
            return False

        key = self._get_key()
        fernet = Fernet(key)

        with open(self.env_file, 'rb') as f:
            data = f.read()

        encrypted = fernet.encrypt(data)

        with open(self.enc_file, 'wb') as f:
            f.write(encrypted)

        print(f"✅ Зашифровано: {self.env_file} → {self.enc_file}")
        return True

    def decrypt(self, force=False):
        """Расшифровать .env.enc → .secrets/.env"""
        if not self.enc_file.exists():
            print(f"❌ Файл {self.enc_file} не найден!")
            return False

        if self.env_file.exists() and not force:
            print(f"⚠️ Файл {self.env_file} уже существует! Используйте --force для перезаписи")
            return False

        key = self._get_key()
        fernet = Fernet(key)

        with open(self.enc_file, 'rb') as f:
            encrypted = f.read()

        try:
            decrypted = fernet.decrypt(encrypted)
        except Exception as e:
            print(f"❌ Ошибка расшифровки: {e}")
            print("   Проверьте правильность пароля!")
            return False

        self.env_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.env_file, 'wb') as f:
            f.write(decrypted)

        print(f"✅ Расшифровано: {self.enc_file} → {self.env_file}")
        return True


def generate_password():
    """Сгенерировать случайный пароль"""
    import secrets
    password = secrets.token_urlsafe(32)
    print(f"🔑 Сгенерированный пароль:\n{password}")
    print("\nСохраните этот пароль в надёжном месте!")
    print("Для использования установите:")
    print(f"  export ENV_ENCRYPT_KEY='{password}'")
    print(f"  # или")
    print(f"  set ENV_ENCRYPT_KEY={password}  # Windows")
    return password


def main():
    parser = argparse.ArgumentParser(
        description='Шифрование/дешифрование .env файлов'
    )
    parser.add_argument(
        'action',
        choices=['encrypt', 'decrypt', 'generate'],
        help='Действие: encrypt, decrypt, generate'
    )
    parser.add_argument(
        '--password',
        help='Пароль для шифрования (если не указан, используется ENV_ENCRYPT_KEY)'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Принудительная перезапись при расшифровке'
    )

    args = parser.parse_args()

    if args.action == 'generate':
        generate_password()
        return

    encryptor = EnvEncryptor(password=args.password)

    if args.action == 'encrypt':
        encryptor.encrypt()
    elif args.action == 'decrypt':
        encryptor.decrypt(force=args.force)


if __name__ == '__main__':
    main()
# end_my_file scripts/encrypt_env.py