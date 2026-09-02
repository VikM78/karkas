#!/usr/bin/env python3
import sys
from pathlib import Path
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app import create_app
from backend.models import db, Manufacturer

app = create_app()
with app.app_context():
    count = Manufacturer.query.count()
    print(f"Manufacturer.query.count() = {count}")
    for m in Manufacturer.query.all():
        print(f"  {m.id}: {m.name} - {m.status}")