from dataclasses import dataclass
from typing import Any, List, Optional

from app.core.config import settings
from app.core.money import round_money


@dataclass
class OrderTotals:
    subtotal: float
    service_charge: float
    tax: float
    discount: float
    total: float
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None

def calculate_order_totals(
    items: List[Any],
    discount_type: Optional[str] = None,
    discount_value: Optional[float] = None,
    tax_rate: Optional[float] = None,
    service_charge_rate: Optional[float] = None,
) -> OrderTotals:
    """
    Pure calculation of order totals.
    Excludes voided/cancelled items.
    """
    effective_tax_rate = tax_rate if tax_rate is not None else settings.TAX_RATE
    effective_service_rate = (
        service_charge_rate if service_charge_rate is not None else settings.SERVICE_CHARGE_RATE
    )

    # Filter active items
    subtotal = 0.0
    for item in items:
        # Check either dict, dataclass, or ORM model
        is_voided = False
        if hasattr(item, "voided") and item.voided:
            is_voided = True
        elif hasattr(item, "status") and item.status == "cancelled":
            is_voided = True
        elif isinstance(item, dict) and (item.get("voided") or item.get("status") == "cancelled"):
            is_voided = True

        if not is_voided:
            price = getattr(item, "price", None)
            qty = getattr(item, "qty", None)
            if price is None and isinstance(item, dict):
                price = item.get("price", 0.0)
                qty = item.get("qty", 1)
            subtotal += (float(price or 0.0) * int(qty or 1))

    subtotal = round_money(subtotal)
    service_charge = round_money(subtotal * effective_service_rate)
    tax = round_money(subtotal * effective_tax_rate)

    discount = 0.0
    if discount_type == "percent":
        pct = min(100.0, max(0.0, float(discount_value or 0.0)))
        discount = round_money((subtotal * pct) / 100.0)
    elif discount_type == "amount":
        val = max(0.0, float(discount_value or 0.0))
        discount = min(subtotal, round_money(val))
    elif discount_value is not None and discount_value > 0 and not discount_type:
        discount = min(subtotal, round_money(float(discount_value)))

    total = max(0.0, round_money(subtotal + service_charge + tax - discount))

    return OrderTotals(
        subtotal=subtotal,
        service_charge=service_charge,
        tax=tax,
        discount=discount,
        total=total,
        discount_type=discount_type,
        discount_value=discount_value,
    )

