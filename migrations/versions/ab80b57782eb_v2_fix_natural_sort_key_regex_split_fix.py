"""v2: fix natural_sort_key (regex split fix)

Revision ID: ab80b57782eb
Revises: 31a8bdae1986
Create Date: 2026-10-02

Исправляет natural_sort_key.

Старая версия использовала regexp_split_to_array с POSIX-группой '(\d+)',
что не работает как capture-группа в PostgreSQL. Числа пропадали из
результата, функция возвращала только текст без цифр.

Новая версия использует цикл с regexp_matches:
    - если строка начинается с цифр → извлекаем их, LPAD до 20
    - если с не-цифр → извлекаем их до первой цифры, lower
    - повторяем до конца строки
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'ab80b57782eb'
down_revision = '31a8bdae1986'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION natural_sort_key(txt text)
        RETURNS text AS $$
        DECLARE
            result text := '';
            remaining text;
            match_result text[];
            non_num text;
            num_str text;
        BEGIN
            IF txt IS NULL THEN
                RETURN NULL;
            END IF;

            remaining := txt;

            WHILE remaining <> '' LOOP
                IF remaining ~ '^[0-9]' THEN
                    match_result := regexp_matches(remaining, '^([0-9]+)(.*)$');
                    IF match_result IS NULL THEN
                        EXIT;
                    END IF;
                    num_str := match_result[1];
                    remaining := COALESCE(match_result[2], '');
                    result := result || lpad(num_str, 20, '0');
                ELSE
                    match_result := regexp_matches(remaining, '^([^0-9]+)(.*)$');
                    IF match_result IS NULL THEN
                        EXIT;
                    END IF;
                    non_num := match_result[1];
                    remaining := COALESCE(match_result[2], '');
                    result := result || lower(non_num);
                END IF;
            END LOOP;

            RETURN result;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    """)


def downgrade():
    # Возвращаем старую (сломанную) версию — на случай отката
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