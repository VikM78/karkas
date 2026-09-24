# start_my_file find_network_bugs.py
import os
import re
from pathlib import Path

def scan_project_for_external_links():
    print("🔍 Сканирование проекта на скрытые внешние сетевые вызовы...")
    
    # Регулярное выражение для поиска любых внешних URL
    url_pattern = re.compile(r'(https?://[^\s\'"}>]+)')
    
    extensions = ['.html', '.js', '.css']
    found_count = 0

    for root, dirs, files in os.walk("."):
        # Пропускаем виртуальное окружение, чтобы не сканировать лишнее
        if "venv" in root or ".git" in root or ".secrets" in root:
            continue
            
        for file in files:
            path = Path(root) / file
            if path.suffix in extensions:
                try:
                    content = path.read_text(encoding='utf-8')
                    matches = url_pattern.findall(content)
                    
                    # Фильтруем локальные вызовы localhost и разрешенные cdnjs
                    external_urls = [m for m in matches if "localhost" not in m and "127.0.0.1" not in m]
                    
                    if external_urls:
                        print(f"\n📂 Файл: {path}")
                        for url in external_urls:
                            print(f"  ❌ Найдена внешняя ссылка: {url}")
                            found_count += 1
                except Exception:
                    pass # Пропускаем бинарные или поврежденные файлы

    print(f"\n📊 Проверка завершена. Найдено внешних вызовов: {found_count}")

if __name__ == "__main__":
    scan_project_for_external_links()
# end_my_file find_network_bugs.py
