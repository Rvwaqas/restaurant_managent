import datetime
import unicodedata
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Union


@dataclass
class StyledLine:
    text: str
    align: str = "left"  # "left", "center", "right"
    bold: bool = False
    size: str = "normal"  # "normal", "double_height", "double_width", "double_both"
    inverted: bool = False

@dataclass
class Separator:
    char: str = "-"

@dataclass
class Blank:
    lines: int = 1

@dataclass
class Cut:
    partial: bool = True
    feed_lines: int = 3

@dataclass
class DrawerKick:
    pin: int = 0
    pulse_on: int = 25
    pulse_off: int = 250

SlipItem = Union[StyledLine, Separator, Blank, Cut, DrawerKick]

@dataclass
class SlipDocument:
    kind: str
    items: List[SlipItem] = field(default_factory=list)

    def add_line(
        self,
        text: str,
        align: str = "left",
        bold: bool = False,
        size: str = "normal",
        inverted: bool = False,
    ):
        self.items.append(
            StyledLine(
                text=text,
                align=align,
                bold=bold,
                size=size,
                inverted=inverted,
            )
        )

    def add_separator(self, char: str = "-"):
        self.items.append(Separator(char=char))

    def add_blank(self, lines: int = 1):
        self.items.append(Blank(lines=lines))

    def add_cut(self, partial: bool = True, feed_lines: int = 3):
        self.items.append(Cut(partial=partial, feed_lines=feed_lines))

    def add_drawer_kick(self):
        self.items.append(DrawerKick())


def sanitize_text(text: str) -> str:
    """
    Sanitize text for ESC/POS and POS printing:
    - Unicode NFKD decomposition
    - Drop combining diacritical marks
    - Replace remaining non-ASCII (>=128) with '?'
    - Strip control characters (<0x20 except newline, plus 0x7f)
    """
    if not text:
        return ""

    # 1. Normalize NFKD & drop combining marks
    nfkd = unicodedata.normalize("NFKD", str(text))
    without_combining = "".join(c for c in nfkd if not unicodedata.combining(c))

    # 2. Filter characters
    cleaned = []
    for c in without_combining:
        code = ord(c)
        if code == 10:  # newline
            cleaned.append(c)
        elif code < 32 or code == 127:  # control chars
            continue
        elif code >= 128:  # non-ascii fallback
            cleaned.append("?")
        else:
            cleaned.append(c)

    return "".join(cleaned)


def format_slip_money(amount: Optional[float], symbol: str = "Rs") -> str:
    """
    Format monetary amount identical to frontend formatMoney:
    e.g. 1700 -> 'Rs 1,700.00'
    """
    val = float(amount) if amount is not None else 0.0
    return f"{symbol} {val:,.2f}"


def format_slip_datetime(
    dt: Optional[datetime.datetime] = None,
    tz_str: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Format datetime for slip header into (date_str, time_str):
    e.g. ('05 Nov 2026', '07:42 PM')
    """
    target = dt if dt is not None else datetime.datetime.now(datetime.timezone.utc)
    # Target formatting: '05 Nov 2026', '07:42 PM'
    date_str = target.strftime("%d %b %Y")
    time_str = target.strftime("%I:%M %p")
    return date_str, time_str


def center(text: str, width: int) -> str:
    s = sanitize_text(text)
    if len(s) >= width:
        return s[:width]
    return s.center(width)


def left_right(left: str, right: str, width: int) -> str:
    l_str = sanitize_text(left)
    r_str = sanitize_text(right)
    combined_len = len(l_str) + len(r_str)
    if combined_len >= width:
        available_left = max(1, width - len(r_str) - 1)
        l_str = l_str[:available_left]
    spaces = max(1, width - len(l_str) - len(r_str))
    return f"{l_str}{' ' * spaces}{r_str}"


def wrap_hanging(text: str, width: int, indent: int = 2) -> List[str]:
    """
    Wraps text with hanging indent for subsequent lines.
    """
    clean = sanitize_text(text)
    words = clean.split()
    if not words:
        return [""]

    lines: List[str] = []
    current_line = words[0]

    for word in words[1:]:
        prefix = " " * indent if lines else ""
        candidate = f"{current_line} {word}"
        if len(candidate) <= width:
            current_line = candidate
        else:
            lines.append(current_line)
            current_line = f"{' ' * indent}{word}"

    if current_line:
        lines.append(current_line)

    return lines

