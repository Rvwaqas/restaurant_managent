import datetime
from typing import Any, Dict, Optional

from app.core.config import settings
from app.services.printing.document import (
    SlipDocument,
    format_slip_datetime,
    format_slip_money,
    left_right,
    wrap_hanging,
)


def render_kitchen_slip(
    payload: Dict[str, Any],
    columns: int = 48,
    now: Optional[datetime.datetime] = None,
) -> SlipDocument:
    doc = SlipDocument(kind="kitchen")
    dt = now or datetime.datetime.now(datetime.timezone.utc)
    date_str, time_str = format_slip_datetime(dt)

    restaurant_name = payload.get("restaurantName") or settings.APP_NAME
    table_num = payload.get("tableNumber", "?")
    floor_name = payload.get("floorName", "Main Floor")
    waiter_name = payload.get("waiterName", "Staff")
    batch_no = payload.get("batchNo", 1)
    category_name = payload.get("categoryName", "Kitchen")
    printer_name = payload.get("printerName")
    order_id = payload.get("orderId", "")
    is_reprint = payload.get("reprint", False) or payload.get("kind") == "kitchen_reprint"
    is_delayed = payload.get("delayed", False)

    # 1. Header
    doc.add_line(restaurant_name, align="center", bold=True)
    doc.add_line("*** KITCHEN ORDER ***", align="center", bold=True)
    if is_reprint:
        doc.add_line("*** REPRINT ***", align="center", bold=True, inverted=True)
    if is_delayed:
        doc.add_line("(delayed)", align="center", bold=True)

    if category_name:
        cat_upper = category_name.upper().strip()
        stn = cat_upper if cat_upper.endswith("STATION") else f"{cat_upper} STATION"
        doc.add_line(f"[ {stn} ]", align="center", inverted=True)

    # 2. Key Metadata
    doc.add_separator("-")
    doc.add_line(f"TABLE: #{table_num}", bold=True, size="double_both")
    doc.add_line(left_right(f"FLOOR: {floor_name}", f"BATCH #{batch_no}", columns))
    waiter_txt = f"WAITER: {waiter_name}"
    prn_txt = f"PRN: {printer_name}" if printer_name else ""
    if prn_txt and (len(waiter_txt) + len(prn_txt) + 1 <= columns):
        doc.add_line(left_right(waiter_txt, prn_txt, columns))
    else:
        doc.add_line(left_right(waiter_txt, "", columns))
        if prn_txt:
            doc.add_line(left_right(prn_txt, "", columns))
    doc.add_line(left_right(date_str, time_str, columns))
    doc.add_separator("-")

    # 3. Item List
    doc.add_line(left_right("QTY  ITEM", "", columns), bold=True)
    items = payload.get("items", [])
    total_qty = 0

    for it in items:
        qty = int(it.get("qty", 1))
        name = it.get("name", "Custom Item")
        note = it.get("note")
        total_qty += qty

        qty_str = f"{qty}x"
        prefix = f"{qty_str:<4} "
        avail_width = max(10, columns - len(prefix))
        wrapped_name = wrap_hanging(name, avail_width, indent=0)

        # First line with Qty
        doc.add_line(f"{prefix}{wrapped_name[0]}", size="double_height", bold=True)
        # Subsequent wrapped lines
        for extra_line in wrapped_name[1:]:
            doc.add_line(f"{' ' * len(prefix)}{extra_line}", size="double_height", bold=True)

        if note:
            note_wrapped = wrap_hanging(f"** NOTE: {note} **", columns - 2, indent=2)
            for n_line in note_wrapped:
                doc.add_line(f"  {n_line}", bold=True)

    doc.add_separator("-")

    # 4. Footer
    doc.add_line(left_right("TOTAL ITEMS:", str(total_qty), columns), bold=True)
    if order_id:
        short_id = order_id[-8:] if len(order_id) > 8 else order_id
        doc.add_line(f"Order: #{short_id}", align="center")
    doc.add_line("--- END OF TICKET ---", align="center")
    doc.add_cut(partial=True, feed_lines=3)

    return doc


def render_cancel_slip(
    payload: Dict[str, Any],
    columns: int = 48,
    now: Optional[datetime.datetime] = None,
) -> SlipDocument:
    doc = SlipDocument(kind="cancel")
    dt = now or datetime.datetime.now(datetime.timezone.utc)
    date_str, time_str = format_slip_datetime(dt)

    restaurant_name = payload.get("restaurantName") or settings.APP_NAME
    table_num = payload.get("tableNumber", "?")
    floor_name = payload.get("floorName", "Main Floor")
    category_name = payload.get("categoryName")
    item_name = payload.get("name") or payload.get("itemName", "Item")
    qty = payload.get("qty", 1)
    reason = payload.get("reason", "Customer cancelled")
    voided_by = payload.get("voidedBy", "Admin")

    # 1. Header
    doc.add_line(restaurant_name, align="center", bold=True)
    doc.add_line("*** ITEM CANCELLED ***", align="center", bold=True, size="double_height", inverted=True)
    doc.add_line("DO NOT PREPARE", align="center", bold=True)
    if category_name:
        cat_upper = category_name.upper().strip()
        stn = cat_upper if cat_upper.endswith("STATION") else f"{cat_upper} STATION"
        doc.add_line(f"[ {stn} ]", align="center")

    # 2. Details
    doc.add_separator("-")
    doc.add_line(f"TABLE: #{table_num}", bold=True, size="double_both")
    doc.add_line(left_right(f"FLOOR: {floor_name}", f"AUTH: {voided_by}", columns))
    doc.add_line(left_right(date_str, time_str, columns))
    doc.add_separator("-")

    # 3. Cancelled Item
    doc.add_line(f"-{qty}x  {item_name}", size="double_height", bold=True)
    doc.add_blank(1)
    doc.add_line(f"REASON: {reason.upper()}", bold=True)
    doc.add_separator("-")

    # 4. Footer
    doc.add_line("DO NOT PREPARE THIS DISH", align="center", bold=True)
    doc.add_line("--- END OF CANCEL TICKET ---", align="center")
    doc.add_cut(partial=True, feed_lines=3)

    return doc


def render_bill_slip(
    payload: Dict[str, Any],
    columns: int = 48,
    now: Optional[datetime.datetime] = None,
) -> SlipDocument:
    doc = SlipDocument(kind="bill")
    dt = now or datetime.datetime.now(datetime.timezone.utc)
    date_str, time_str = format_slip_datetime(dt)

    restaurant_name = payload.get("restaurantName") or settings.APP_NAME
    bill_no = payload.get("billNo", "B-0001")
    table_num = payload.get("tableNumber", "?")
    floor_name = payload.get("floorName", "Dine-In")
    waiter_name = payload.get("waiterName", "Staff")
    payment_method = str(payload.get("paymentMethod", "CASH")).upper()
    is_reprint = payload.get("reprint", False) or payload.get("kind") == "bill_reprint"

    subtotal = float(payload.get("subtotal", 0.0))
    discount = float(payload.get("discount", 0.0))
    service_charge = float(payload.get("serviceCharge", 0.0))
    tax = float(payload.get("tax", 0.0))
    total = float(payload.get("total", 0.0))
    amount_received = payload.get("amountReceived")
    change_due = payload.get("changeDue", 0.0)

    # 1. Header
    doc.add_line(restaurant_name, align="center", bold=True, size="double_both")
    if is_reprint:
        doc.add_line("*** DUPLICATE COPY ***", align="center", bold=True)
    doc.add_line(floor_name, align="center")
    doc.add_line("*** FINAL BILL RECEIPT ***", align="center", bold=True)

    # 2. Metadata
    doc.add_separator("-")
    doc.add_line(left_right(f"BILL NO: {bill_no}", f"TABLE: #{table_num}", columns), bold=True)
    doc.add_line(left_right(f"WAITER: {waiter_name}", f"METHOD: {payment_method}", columns))
    doc.add_line(left_right(date_str, time_str, columns))
    doc.add_separator("-")

    # 3. Item rows
    items = payload.get("items", [])

    # 3-column / 4-column layout depending on columns
    if columns >= 48:
        # QTY (4), ITEM (avail), RATE (8), AMOUNT (10)
        doc.add_line(
            f"{'QTY':<4} {'ITEM':<22} {'RATE':>9} {'AMOUNT':>10}",
            bold=True,
        )
        doc.add_separator("-")
        for it in items:
            qty = int(it.get("qty", 1))
            name = it.get("name", "Dish")
            price = float(it.get("price", 0.0))
            line_tot = float(it.get("total", price * qty))

            rate_str = f"{price:,.2f}"
            amt_str = f"{line_tot:,.2f}"
            prefix = f"{qty}x  "
            avail_item_width = columns - 4 - 10 - 11 - 3
            wrapped_name = wrap_hanging(name, max(12, avail_item_width), indent=0)

            # First line
            first_col = f"{prefix}{wrapped_name[0]}"
            doc.add_line(
                f"{first_col:<27} {rate_str:>9} {amt_str:>10}"
            )
            # Subsequent lines
            for extra in wrapped_name[1:]:
                doc.add_line(f"    {extra}")

    else:
        # Compact for 32 / 42 columns: QTY, ITEM, AMOUNT
        amt_col_width = 10
        doc.add_line(
            left_right("QTY ITEM", "AMOUNT", columns),
            bold=True,
        )
        doc.add_separator("-")
        for it in items:
            qty = int(it.get("qty", 1))
            name = it.get("name", "Dish")
            line_tot = float(it.get("total", it.get("price", 0.0) * qty))
            amt_str = f"{line_tot:,.2f}"

            prefix = f"{qty}x "
            avail = columns - amt_col_width - 1
            wrapped = wrap_hanging(name, avail - len(prefix), indent=0)

            doc.add_line(left_right(f"{prefix}{wrapped[0]}", amt_str, columns))
            for extra in wrapped[1:]:
                doc.add_line(f"   {extra}")

    doc.add_separator("-")

    # 4. Financial Summary
    doc.add_line(left_right("Subtotal:", format_slip_money(subtotal), columns))

    if discount > 0:
        doc.add_line(left_right("Discount:", f"-{format_slip_money(discount)}", columns), bold=True)

    # ONLY show service charge and tax if > 0
    if service_charge > 0:
        doc.add_line(left_right("Service Charge:", format_slip_money(service_charge), columns))
    if tax > 0:
        doc.add_line(left_right("Tax:", format_slip_money(tax), columns))

    doc.add_separator(".")
    doc.add_line(left_right("GRAND TOTAL:", format_slip_money(total), columns), bold=True, size="double_height")

    # Cash payment detail
    if payment_method == "CASH" and amount_received is not None:
        doc.add_separator(".")
        doc.add_line(left_right("Cash Received:", format_slip_money(amount_received), columns))
        doc.add_line(left_right("Change Due:", format_slip_money(change_due), columns), bold=True)

    doc.add_separator("-")

    # 5. Footer
    doc.add_line("Thank you, visit again!", align="center", bold=True)
    doc.add_line("--- END OF BILL ---", align="center")
    doc.add_cut(partial=True, feed_lines=3)

    if payment_method == "CASH":
        doc.add_drawer_kick()

    return doc


def render_test_slip(
    payload: Dict[str, Any],
    columns: int = 48,
    now: Optional[datetime.datetime] = None,
) -> SlipDocument:
    doc = SlipDocument(kind="test")
    dt = now or datetime.datetime.now(datetime.timezone.utc)
    date_str, time_str = format_slip_datetime(dt)

    restaurant_name = payload.get("restaurantName") or settings.APP_NAME
    printer_name = payload.get("printerName", "Thermal Printer")
    ip = payload.get("ip", "192.168.1.100")
    port = payload.get("port", 9100)
    role = str(payload.get("role", "kitchen")).upper()

    doc.add_line(restaurant_name, align="center", bold=True)
    doc.add_line("*** PRINTER TEST SLIP ***", align="center", bold=True)
    doc.add_separator("-")

    doc.add_line(left_right("Printer:", printer_name, columns))
    doc.add_line(left_right("IP:Port:", f"{ip}:{port}", columns))
    doc.add_line(left_right("Role:", role, columns))
    doc.add_line(left_right("Time:", f"{date_str} {time_str}", columns))

    doc.add_separator("=")
    # Ruler line: repeated 1234567890 up to columns
    ruler = ("1234567890" * 6)[:columns]
    doc.add_line(ruler)
    doc.add_line(left_right("CONFIGURED COLUMNS:", f"{columns} cols", columns), bold=True)
    doc.add_separator("=")

    doc.add_line("TEST PRINT OK", align="center", bold=True)
    doc.add_cut(partial=True, feed_lines=3)

    return doc


def render_slip(
    kind: str,
    payload: Dict[str, Any],
    columns: int = 48,
    now: Optional[datetime.datetime] = None,
) -> SlipDocument:
    """
    Pure layout dispatcher.
    Accepts version 'v': 1 payload.
    """
    version = payload.get("v", 1)
    if version != 1:
        raise ValueError(f"Unsupported slip payload version: {version}")

    norm_kind = (payload.get("kind") or kind).lower()

    if norm_kind in ("kitchen", "kitchen_reprint"):
        return render_kitchen_slip(payload, columns=columns, now=now)
    elif norm_kind == "cancel":
        return render_cancel_slip(payload, columns=columns, now=now)
    elif norm_kind in ("bill", "bill_reprint"):
        return render_bill_slip(payload, columns=columns, now=now)
    elif norm_kind == "test":
        return render_test_slip(payload, columns=columns, now=now)
    else:
        raise ValueError(f"Unknown slip kind: {norm_kind}")
