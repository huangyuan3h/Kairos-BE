import datetime

from core.database.keys import (
    make_pk_stock,
    make_sk_meta,
    make_sk_quote_date,
    make_gsi1pk_symbol,
    make_gsi1sk_entity,
    make_gsi2pk_market_status,
    make_gsi2sk_entity,
)


def test_key_builders():
    assert make_pk_stock("600519") == "STOCK#600519"
    assert make_sk_meta("PROFILE", "2025-01-01T00:00:00Z") == "META#PROFILE#2025-01-01T00:00:00Z"

    d = datetime.date(2025, 8, 8)
    assert make_sk_quote_date(d) == "QUOTE#2025-08-08"

    assert make_gsi1pk_symbol("600519") == "SYMBOL#600519"
    assert make_gsi1sk_entity("PROFILE", "2025-01-01T00:00:00Z") == "ENTITY#PROFILE#2025-01-01T00:00:00Z"

    assert make_gsi2pk_market_status("CN", "ACTIVE") == "MARKET#CN#STATUS#ACTIVE"
    assert make_gsi2sk_entity("PROFILE", "2025-01-01T00:00:00Z") == "ENTITY#PROFILE#2025-01-01T00:00:00Z"
