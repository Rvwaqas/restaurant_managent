import logging

from sqlalchemy.orm import Session

from app.models import Order, Table

logger = logging.getLogger("pos.table_consistency")

def run_table_consistency_check(db: Session) -> int:
    """
    Self-check startup repair for table-order consistency:
    - Frees occupied tables with no active open order.
    - Marks free tables occupied if an open order exists.
    - Synchronizes current_order_id and running_total.
    Returns the number of repaired tables.
    """
    tables = db.query(Table).filter(Table.is_deleted == False).all()
    repairs_count = 0
    repaired_tables = []

    for table in tables:
        open_order = (
            db.query(Order)
            .filter(Order.table_id == table.id, Order.status == "open")
            .first()
        )

        table_repaired = False
        if table.status == "occupied":
            if not open_order:
                logger.warning(
                    "Consistency repair: Table %s (#%s) was marked occupied with no open order. Resetting to free.",
                    table.id,
                    table.number,
                )
                table.status = "free"
                table.current_order_id = None
                table_repaired = True
            else:
                if table.current_order_id != open_order.id:
                    table.current_order_id = open_order.id
                    table_repaired = True

        elif table.status == "free":
            if open_order:
                logger.warning(
                    "Consistency repair: Table %s (#%s) was marked free but has open order %s. Setting to occupied.",
                    table.id,
                    table.number,
                    open_order.id,
                )
                table.status = "occupied"
                table.current_order_id = open_order.id
                table_repaired = True

        if table_repaired:
            repairs_count += 1
            repaired_tables.append(table)

    if repairs_count > 0:
        from app.services import audit
        audit.record(
            session=db,
            event="recovery.table_fixed",
            role="system",
            details={
                "repairedCount": repairs_count,
                "tables": [{"tableId": t.id, "number": t.number, "status": t.status} for t in repaired_tables],
            },
        )
        db.commit()
        logger.info("Table consistency check repaired %d table(s).", repairs_count)
        from app.services.events import emit
        for t in repaired_tables:
            emit("table.updated", {"floorId": t.floor_id, "tableId": t.id})
    else:
        logger.info("Table consistency check completed: all tables consistent.")

    return repairs_count
