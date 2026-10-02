"""v2: add natural_sort_key function

Revision ID: 31a8bdae1986
Revises: 17be8c17c38e
Create Date: 2026-10-02 18:07:19.341027

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '31a8bdae1986'
down_revision = '17be8c17c38e'
branch_labels = None
depends_on = None


def upgrade():
    """
    Создать функцию natural_sort_key для human-friendly сортировки.

    Примеры:
        natural_sort_key('Фирма-1')  → 'фирма-00000000000000000001'
        natural_sort_key('Фирма-10') → 'фирма-00000000000000000010'
        natural_sort_key('Фирма-2')  → 'фирма-00000000000000000002'

    Тогда ORDER BY natural_sort_key(name) даёт:
        Фирма-1, Фирма-2, ..., Фирма-10, Фирма-11
    """
    op.execute("""
        CREATE OR REPLACE FUNCTION natural_sort_key(txt text)
        RETURNS text AS $$
        DECLARE
            result text := '';
            parts text[];
            part text;
        BEGIN
            IF txt IS NULL THEN
                RETURN NULL;
            END IF;

            parts := regexp_split_to_array(txt, '(\\d+)');

            FOREACH part IN ARRAY parts LOOP
                IF part IS NULL OR part = '' THEN
                    CONTINUE;
                END IF;

                IF part ~ '^\\d+$' THEN
                    result := result || lpad(part, 20, '0');
                ELSE
                    result := result || lower(part);
                END IF;
            END LOOP;

            RETURN result;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    """)


def downgrade():
    op.execute("DROP FUNCTION IF EXISTS natural_sort_key(text)")
