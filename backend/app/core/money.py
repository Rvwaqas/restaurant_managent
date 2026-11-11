"""Money conversion utilities between decimal amounts and integer minor units."""

def to_minor_units(amount: float) -> int:
    """Convert a decimal amount (e.g. 12.50) to minor units (e.g. 1250)."""
    return int(round(amount * 100))

def from_minor_units(minor: int) -> float:
    """Convert integer minor units (e.g. 1250) to a 2-decimal float (e.g. 12.50)."""
    return round(minor / 100.0, 2)

def round_money(amount: float) -> float:
    """Round a monetary amount to 2 decimal places."""
    return round(float(amount), 2)

def format_currency(amount: float, symbol: str = "Rs") -> str:
    """Format money with thousand separators and 2 decimals, e.g. 'Rs 1,700.00'."""
    val = float(amount) if amount is not None else 0.0
    return f"{symbol} {val:,.2f}"


