import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.endpoints.auth import load_staff_users
from app.schemas import (
    CategorySalesLegacyRow,
    CategorySalesRow,
    ComparisonData,
    DailyClosingReport,
    DailySalesRow,
    DiscountRow,
    FloorSalesRow,
    PaymentMethodRow,
    PeakHourCell,
    ReportPeriodMetrics,
    ReportSummary,
    SalesOverTimeBucket,
    TopItemRow,
    VoidedItemRow,
    WaiterSalesLegacyRow,
    WaiterSalesRow,
)


def round_money(val: float) -> float:
    return round(float(val or 0.0), 2)


def round_percent(val: float) -> float:
    d = Decimal(str(val or 0.0))
    return float(d.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def get_staff_name(user_id: Optional[str]) -> str:
    if not user_id:
        return "Unknown"
    for u in load_staff_users():
        if u["id"] == user_id or u["username"] == user_id:
            return u["name"]
    return user_id


def build_order_filter_clause(
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
    alias: str = "o",
) -> Tuple[str, Dict[str, Any]]:
    clauses = [
        f"{alias}.status = 'paid'",
        f"{alias}.business_date >= :from_date",
        f"{alias}.business_date <= :to_date",
    ]
    params: Dict[str, Any] = {
        "from_date": from_date,
        "to_date": to_date,
    }

    if floor_id and floor_id != "all":
        clauses.append(f"{alias}.floor_id = :floor_id")
        params["floor_id"] = floor_id

    if waiter_id:
        clauses.append(f"{alias}.waiter_id = :waiter_id")
        params["waiter_id"] = waiter_id

    if payment_method:
        clauses.append(f"{alias}.payment_method = :payment_method")
        params["payment_method"] = payment_method

    if category_id:
        clauses.append(
            f"EXISTS (SELECT 1 FROM order_items oi_cat WHERE oi_cat.order_id = {alias}.id AND oi_cat.category_id = :category_id)"
        )
        params["category_id"] = category_id

    return " AND ".join(clauses), params


def compute_period_metrics(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> ReportPeriodMetrics:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
        alias="o",
    )

    # 1. Order level aggregates
    order_query = text(f"""
        SELECT
            COALESCE(SUM(o.subtotal), 0) AS gross_sales,
            COALESCE(SUM(o.discount), 0) AS discounts,
            COALESCE(SUM(o.tax), 0) AS tax,
            COALESCE(SUM(o.service_charge), 0) AS service_charge,
            COALESCE(SUM(o.total), 0) AS grand_total,
            COUNT(o.id) AS bills_count
        FROM orders o
        WHERE {where_sql}
    """)
    row = db.execute(order_query, params).fetchone()

    gross_sales = float(row[0] or 0.0)
    discounts = float(row[1] or 0.0)
    tax = float(row[2] or 0.0)
    service_charge = float(row[3] or 0.0)
    grand_total = float(row[4] or 0.0)
    bills_count = int(row[5] or 0)
    net_sales = gross_sales - discounts
    avg_bill = grand_total / bills_count if bills_count > 0 else 0.0

    # 2. Items sold (non-voided lines of matching paid orders)
    items_sold_query = text(f"""
        SELECT COALESCE(SUM(oi.qty), 0)
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE {where_sql} AND oi.voided = 0
    """)
    items_sold = int(db.execute(items_sold_query, params).scalar() or 0)

    # 3. Voided items whose void business date is in range
    void_clauses = [
        "oi.voided = 1",
        "oi.voided_business_date >= :from_date",
        "oi.voided_business_date <= :to_date",
    ]
    void_params: Dict[str, Any] = {
        "from_date": from_date,
        "to_date": to_date,
    }
    if floor_id and floor_id != "all":
        void_clauses.append("o.floor_id = :floor_id")
        void_params["floor_id"] = floor_id
    if waiter_id:
        void_clauses.append("o.waiter_id = :waiter_id")
        void_params["waiter_id"] = waiter_id
    if category_id:
        void_clauses.append("oi.category_id = :category_id")
        void_params["category_id"] = category_id

    void_where = " AND ".join(void_clauses)
    void_query = text(f"""
        SELECT
            COUNT(oi.id) AS void_count,
            COALESCE(SUM(oi.price * oi.qty), 0) AS void_amount
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE {void_where}
    """)
    v_row = db.execute(void_query, void_params).fetchone()
    voided_items_count = int(v_row[0] or 0)
    voided_amount = float(v_row[1] or 0.0)

    return ReportPeriodMetrics(
        grossSales=round_money(gross_sales),
        discounts=round_money(discounts),
        netSales=round_money(net_sales),
        tax=round_money(tax),
        serviceCharge=round_money(service_charge),
        grandTotal=round_money(grand_total),
        billsCount=bills_count,
        itemsSold=items_sold,
        avgBill=round_money(avg_bill),
        voidedItemsCount=voided_items_count,
        voidedAmount=round_money(voided_amount),
    )


def get_summary(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> ReportSummary:
    current = compute_period_metrics(
        db=db,
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
    )

    # Compute previous period of identical number of days
    d_from = datetime.date.fromisoformat(from_date)
    d_to = datetime.date.fromisoformat(to_date)
    days_count = (d_to - d_from).days + 1

    prev_to_date = d_from - datetime.timedelta(days=1)
    prev_from_date = prev_to_date - datetime.timedelta(days=days_count - 1)

    previous = compute_period_metrics(
        db=db,
        from_date=prev_from_date.strftime("%Y-%m-%d"),
        to_date=prev_to_date.strftime("%Y-%m-%d"),
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
    )

    # Change percentage identical to mock logic
    change_percent: Dict[str, float] = {}
    curr_dict = current.model_dump()
    prev_dict = previous.model_dump()

    for k in curr_dict.keys():
        c_val = float(curr_dict[k])
        p_val = float(prev_dict[k])
        if p_val == 0.0:
            change_percent[k] = 100.0 if c_val > 0.0 else 0.0
        else:
            diff = ((c_val - p_val) / p_val) * 100.0
            change_percent[k] = round_percent(diff)

    return ReportSummary(
        **curr_dict,
        comparison=ComparisonData(
            previousPeriod=previous,
            changePercent=change_percent,
        ),
    )


def get_sales_over_time(
    db: Session,
    from_date: str,
    to_date: str,
    group_by: Optional[str] = None,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> List[SalesOverTimeBucket]:
    d_from = datetime.date.fromisoformat(from_date)
    d_to = datetime.date.fromisoformat(to_date)
    diff_days = (d_to - d_from).days

    if not group_by:
        group_by = "hour" if diff_days <= 1 else ("day" if diff_days <= 62 else "month")

    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
        alias="o",
    )

    if group_by == "hour":
        bucket_expr = "o.business_date || 'T' || printf('%02d', o.paid_local_hour) || '\\:00'"
    elif group_by == "day":
        bucket_expr = "o.business_date"
    else:  # month
        bucket_expr = "substr(o.business_date, 1, 7)"

    sql = text(f"""
        SELECT
            {bucket_expr} AS bucket,
            COALESCE(SUM(o.total), 0) AS grand_total,
            COUNT(o.id) AS bills_count,
            COALESCE(SUM(o.total - COALESCE(o.tax, 0) - COALESCE(o.service_charge, 0)), 0) AS net_sales
        FROM orders o
        WHERE {where_sql}
        GROUP BY bucket
        ORDER BY bucket ASC
    """)

    rows = db.execute(sql, params).fetchall()
    return [
        SalesOverTimeBucket(
            bucket=str(r[0]),
            grandTotal=round_money(r[1]),
            billsCount=int(r[2]),
            netSales=round_money(r[3]),
        )
        for r in rows
        if r[0] is not None
    ]


def get_by_category(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
) -> List[CategorySalesRow]:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=None,
        alias="o",
    )

    sql = text(f"""
        SELECT
            oi.category_id,
            COALESCE(c.name, oi.category_id) AS category_name,
            COALESCE(c.floor_id, o.floor_id) AS floor_id,
            COALESCE(SUM(oi.qty), 0) AS total_qty,
            COALESCE(SUM(oi.price * oi.qty), 0) AS total_amount
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN categories c ON oi.category_id = c.id
        WHERE {where_sql} AND oi.voided = 0
        GROUP BY oi.category_id
        ORDER BY total_amount DESC
    """)

    rows = db.execute(sql, params).fetchall()
    total_revenue = sum(float(r[4] or 0.0) for r in rows)

    return [
        CategorySalesRow(
            categoryId=str(r[0]),
            name=str(r[1]),
            floorId=str(r[2]),
            qty=int(r[3]),
            amount=round_money(r[4]),
            sharePercent=round_percent((float(r[4]) / total_revenue * 100.0) if total_revenue > 0 else 0.0),
        )
        for r in rows
    ]


def get_by_floor(
    db: Session,
    from_date: str,
    to_date: str,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> List[FloorSalesRow]:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=None,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
        alias="o",
    )

    sql = text(f"""
        SELECT
            o.floor_id,
            COALESCE(f.name, o.floor_id) AS floor_name,
            COUNT(o.id) AS bills_count,
            COALESCE(SUM(o.total), 0) AS grand_total
        FROM orders o
        LEFT JOIN floors f ON o.floor_id = f.id
        WHERE {where_sql}
        GROUP BY o.floor_id
        ORDER BY grand_total DESC
    """)

    rows = db.execute(sql, params).fetchall()
    return [
        FloorSalesRow(
            floorId=str(r[0]),
            name=str(r[1]),
            billsCount=int(r[2]),
            grandTotal=round_money(r[3]),
            avgBill=round_money((float(r[3]) / int(r[2])) if int(r[2]) > 0 else 0.0),
        )
        for r in rows
    ]


def get_by_waiter(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> List[WaiterSalesRow]:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=None,
        payment_method=payment_method,
        category_id=category_id,
        alias="o",
    )

    # Note: Attribution matches order.waiter_id per mock and prompt
    sql = text(f"""
        SELECT
            o.waiter_id,
            COUNT(DISTINCT o.id) AS bills_count,
            COALESCE(SUM(o.total), 0) AS grand_total,
            COALESCE((
                SELECT SUM(oi2.qty)
                FROM order_items oi2
                JOIN orders o2 ON oi2.order_id = o2.id
                WHERE o2.waiter_id = o.waiter_id
                  AND {where_sql.replace('o.', 'o2.')}
                  AND oi2.voided = 0
            ), 0) AS items_sold
        FROM orders o
        WHERE {where_sql}
        GROUP BY o.waiter_id
        ORDER BY grand_total DESC
    """)

    rows = db.execute(sql, params).fetchall()
    total_sales = sum(float(r[2] or 0.0) for r in rows)

    return [
        WaiterSalesRow(
            waiterId=str(r[0]),
            name=get_staff_name(str(r[0])),
            billsCount=int(r[1]),
            itemsSold=int(r[3]),
            grandTotal=round_money(r[2]),
            avgBill=round_money((float(r[2]) / int(r[1])) if int(r[1]) > 0 else 0.0),
            sharePercent=round_percent((float(r[2]) / total_sales * 100.0) if total_sales > 0 else 0.0),
        )
        for r in rows
    ]


def get_top_items(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
    limit: int = 20,
    sort: str = "amount",
    order: str = "desc",
) -> List[TopItemRow]:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
        alias="o",
    )

    order_direction = "ASC" if order.lower() == "asc" else "DESC"
    order_col = "total_qty" if sort.lower() == "qty" else "total_amount"

    params["limit"] = max(1, min(100, limit))

    sql = text(f"""
        SELECT
            oi.menu_item_id,
            oi.name,
            COALESCE(c.name, oi.category_id) AS category_name,
            COALESCE(mi.floor_id, o.floor_id) AS floor_id,
            COALESCE(SUM(oi.qty), 0) AS total_qty,
            COALESCE(SUM(oi.price * oi.qty), 0) AS total_amount
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN categories c ON oi.category_id = c.id
        WHERE {where_sql} AND oi.voided = 0
        GROUP BY oi.menu_item_id
        ORDER BY {order_col} {order_direction}
        LIMIT :limit
    """)

    rows = db.execute(sql, params).fetchall()
    return [
        TopItemRow(
            menuItemId=str(r[0]),
            name=str(r[1]),
            categoryName=str(r[2]),
            floorId=str(r[3]),
            qty=int(r[4]),
            amount=round_money(r[5]),
        )
        for r in rows
    ]


def get_by_payment_method(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    category_id: Optional[str] = None,
) -> List[PaymentMethodRow]:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=None,
        category_id=category_id,
        alias="o",
    )

    sql = text(f"""
        SELECT
            COALESCE(o.payment_method, 'cash') AS method,
            COUNT(o.id) AS bills_count,
            COALESCE(SUM(o.total), 0) AS amount
        FROM orders o
        WHERE {where_sql}
        GROUP BY method
        ORDER BY amount DESC
    """)

    rows = db.execute(sql, params).fetchall()
    total_amt = sum(float(r[2] or 0.0) for r in rows)

    return [
        PaymentMethodRow(
            method=str(r[0]),
            billsCount=int(r[1]),
            amount=round_money(r[2]),
            sharePercent=round_percent((float(r[2]) / total_amt * 100.0) if total_amt > 0 else 0.0),
        )
        for r in rows
    ]


def get_peak_hours(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> List[PeakHourCell]:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
        alias="o",
    )

    sql = text(f"""
        SELECT
            o.paid_local_weekday,
            o.paid_local_hour,
            COUNT(o.id) AS bills_count,
            COALESCE(SUM(o.total), 0) AS grand_total
        FROM orders o
        WHERE {where_sql} AND o.paid_local_weekday IS NOT NULL AND o.paid_local_hour IS NOT NULL
        GROUP BY o.paid_local_weekday, o.paid_local_hour
    """)

    rows = db.execute(sql, params).fetchall()
    # Convert Python weekday (0=Mon .. 6=Sun) to JS weekday (0=Sun .. 6=Sat)
    # Python 0 (Mon) -> JS 1 (Mon); Python 6 (Sun) -> JS 0 (Sun)
    return [
        PeakHourCell(
            weekday=(int(r[0]) + 1) % 7,
            hour=int(r[1]),
            billsCount=int(r[2]),
            grandTotal=round_money(r[3]),
        )
        for r in rows
    ]


def get_discounts(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> List[DiscountRow]:
    where_sql, params = build_order_filter_clause(
        from_date=from_date,
        to_date=to_date,
        floor_id=floor_id,
        waiter_id=waiter_id,
        payment_method=payment_method,
        category_id=category_id,
        alias="o",
    )

    sql = text(f"""
        SELECT
            COALESCE(o.bill_no, '') AS bill_no,
            o.id AS order_id,
            COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', o.paid_at), '') AS paid_at,
            COALESCE(t.number, 0) AS table_number,
            COALESCE(f.name, o.floor_id) AS floor_name,
            o.waiter_id,
            COALESCE(o.discount_type, 'amount') AS discount_type,
            COALESCE(o.discount_value, 0) AS discount_value,
            COALESCE(o.discount, 0) AS discount_amount
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN floors f ON o.floor_id = f.id
        WHERE {where_sql} AND o.discount > 0
        ORDER BY o.paid_at DESC
    """)

    rows = db.execute(sql, params).fetchall()
    return [
        DiscountRow(
            billNo=str(r[0]),
            orderId=str(r[1]),
            paidAt=str(r[2]),
            tableNumber=int(r[3]),
            floorName=str(r[4]),
            waiterName=get_staff_name(str(r[5])),
            discountType=str(r[6]),
            discountValue=float(r[7]),
            discountAmount=round_money(r[8]),
        )
        for r in rows
    ]


def get_voided_items(
    db: Session,
    from_date: str,
    to_date: str,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    category_id: Optional[str] = None,
) -> List[VoidedItemRow]:
    void_clauses = [
        "oi.voided = 1",
        "oi.voided_business_date >= :from_date",
        "oi.voided_business_date <= :to_date",
    ]
    params: Dict[str, Any] = {
        "from_date": from_date,
        "to_date": to_date,
    }
    if floor_id and floor_id != "all":
        void_clauses.append("o.floor_id = :floor_id")
        params["floor_id"] = floor_id
    if waiter_id:
        void_clauses.append("o.waiter_id = :waiter_id")
        params["waiter_id"] = waiter_id
    if category_id:
        void_clauses.append("oi.category_id = :category_id")
        params["category_id"] = category_id

    where_sql = " AND ".join(void_clauses)

    sql = text(f"""
        SELECT
            COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', oi.voided_at), strftime('%Y-%m-%dT%H:%M:%SZ', o.created_at)) AS item_time,
            o.bill_no,
            o.id AS order_id,
            COALESCE(t.number, 0) AS table_number,
            COALESCE(f.name, o.floor_id) AS floor_name,
            oi.name AS item_name,
            oi.qty,
            oi.price * oi.qty AS amount,
            COALESCE(oi.void_reason, oi.cancel_reason, 'No reason given') AS reason,
            oi.voided_by
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN floors f ON o.floor_id = f.id
        WHERE {where_sql}
        ORDER BY item_time DESC
    """)

    rows = db.execute(sql, params).fetchall()
    return [
        VoidedItemRow(
            time=str(r[0]),
            billNo=str(r[1]) if r[1] else None,
            orderId=str(r[2]),
            tableNumber=int(r[3]),
            floorName=str(r[4]),
            itemName=str(r[5]),
            qty=int(r[6]),
            amount=round_money(r[7]),
            reason=str(r[8]),
            voidedBy=get_staff_name(str(r[9])) if r[9] else "Unknown",
        )
        for r in rows
    ]


def get_daily_closing(
    db: Session,
    date: str,
    floor_id: Optional[str] = None,
) -> DailyClosingReport:
    summary = compute_period_metrics(
        db=db,
        from_date=date,
        to_date=date,
        floor_id=floor_id,
    )

    where_sql, params = build_order_filter_clause(
        from_date=date,
        to_date=date,
        floor_id=floor_id,
        alias="o",
    )

    # First and last bill timestamps
    times_sql = text(f"""
        SELECT
            MIN(strftime('%Y-%m-%dT%H:%M:%SZ', o.paid_at)),
            MAX(strftime('%Y-%m-%dT%H:%M:%SZ', o.paid_at))
        FROM orders o
        WHERE {where_sql}
    """)
    t_row = db.execute(times_sql, params).fetchone()
    opened_at = str(t_row[0]) if (t_row and t_row[0]) else None
    closed_at = str(t_row[1]) if (t_row and t_row[1]) else None

    by_payment_method = get_by_payment_method(db=db, from_date=date, to_date=date, floor_id=floor_id)
    by_floor = get_by_floor(db=db, from_date=date, to_date=date)
    by_category = get_by_category(db=db, from_date=date, to_date=date, floor_id=floor_id)
    top_items = get_top_items(db=db, from_date=date, to_date=date, floor_id=floor_id, limit=10)

    # Discounts and voided totals on that business date
    discounts_total = summary.discounts
    voided_total = summary.voidedAmount

    # Open tables count: count of orders in status 'open' or tables currently occupied
    open_sql = text("""
        SELECT MAX(
            (SELECT COUNT(id) FROM orders WHERE status = 'open'),
            (SELECT COUNT(id) FROM tables WHERE status = 'occupied')
        )
    """)
    open_tables_count = int(db.execute(open_sql).scalar() or 0)

    return DailyClosingReport(
        date=date,
        openedAt=opened_at,
        closedAt=closed_at,
        summary=summary,
        byPaymentMethod=by_payment_method,
        byFloor=by_floor,
        byCategory=by_category,
        topItems=top_items,
        discountsTotal=discounts_total,
        voidedTotal=voided_total,
        openTablesCount=open_tables_count,
    )


# Legacy endpoints for backward compatibility
def get_daily_sales_legacy(
    db: Session,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    floor_id: Optional[str] = None,
) -> List[DailySalesRow]:
    today = datetime.date.today().strftime("%Y-%m-%d")
    f_date = from_date or today
    t_date = to_date or today

    where_sql, params = build_order_filter_clause(
        from_date=f_date,
        to_date=t_date,
        floor_id=floor_id,
        alias="o",
    )

    sql = text(f"""
        SELECT
            o.business_date,
            COALESCE(SUM(o.total), 0) AS total_sales,
            COUNT(o.id) AS total_orders,
            COALESCE(SUM(o.tax), 0) AS total_tax
        FROM orders o
        WHERE {where_sql}
        GROUP BY o.business_date
        ORDER BY o.business_date ASC
    """)
    rows = db.execute(sql, params).fetchall()
    return [
        DailySalesRow(
            date=str(r[0]),
            totalSales=round_money(r[1]),
            totalOrders=int(r[2]),
            totalTax=round_money(r[3]),
        )
        for r in rows
    ]


def get_category_sales_legacy(
    db: Session,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    floor_id: Optional[str] = None,
) -> List[CategorySalesLegacyRow]:
    today = datetime.date.today().strftime("%Y-%m-%d")
    rows = get_by_category(db, from_date or today, to_date or today, floor_id=floor_id)
    return [
        CategorySalesLegacyRow(
            categoryId=r.categoryId,
            categoryName=r.name,
            totalSales=r.amount,
            itemCount=r.qty,
        )
        for r in rows
    ]


def get_waiter_sales_legacy(
    db: Session,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> List[WaiterSalesLegacyRow]:
    today = datetime.date.today().strftime("%Y-%m-%d")
    rows = get_by_waiter(db, from_date or today, to_date or today)
    return [
        WaiterSalesLegacyRow(
            waiterId=r.waiterId,
            waiterName=r.name,
            totalSales=r.grandTotal,
            totalOrders=r.billsCount,
        )
        for r in rows
    ]
