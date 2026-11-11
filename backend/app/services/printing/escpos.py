from app.services.printing.document import (
    Blank,
    Cut,
    DrawerKick,
    Separator,
    SlipDocument,
    StyledLine,
    sanitize_text,
)

# ESC/POS Constants
ESC = b"\x1b"
GS = b"\x1d"

CMD_INIT = ESC + b"@"
CMD_ALIGN_LEFT = ESC + b"a\x00"
CMD_ALIGN_CENTER = ESC + b"a\x01"
CMD_ALIGN_RIGHT = ESC + b"a\x02"

CMD_BOLD_ON = ESC + b"E\x01"
CMD_BOLD_OFF = ESC + b"E\x00"

CMD_SIZE_NORMAL = GS + b"!\x00"
CMD_SIZE_DOUBLE_HEIGHT = GS + b"!\x01"
CMD_SIZE_DOUBLE_WIDTH = GS + b"!\x10"
CMD_SIZE_DOUBLE_BOTH = GS + b"!\x11"

CMD_INVERT_ON = GS + b"B\x01"
CMD_INVERT_OFF = GS + b"B\x00"

CMD_RESET_STYLES = (
    CMD_ALIGN_LEFT + CMD_BOLD_OFF + CMD_SIZE_NORMAL + CMD_INVERT_OFF
)

CMD_DRAWER_KICK = ESC + b"p\x00\x19\xfa"  # ESC p 0 25 250 (pulse drawer pin 2)


def to_escpos(
    doc: SlipDocument,
    print_cut: bool = True,
    cash_drawer_kick: bool = False,
    columns: int = 48,
) -> bytes:
    """
    Render SlipDocument to pure ESC/POS byte stream.
    All dynamic text is guaranteed ASCII.
    """
    out = bytearray()
    out.extend(CMD_INIT)

    # Defensively limit to 200 items/lines
    items_to_render = doc.items[:200]
    if len(doc.items) > 200:
        items_to_render.append(StyledLine(text="...", align="center"))

    for item in items_to_render:
        if isinstance(item, StyledLine):
            # Alignment
            if item.align == "center":
                out.extend(CMD_ALIGN_CENTER)
            elif item.align == "right":
                out.extend(CMD_ALIGN_RIGHT)
            else:
                out.extend(CMD_ALIGN_LEFT)

            # Bold
            if item.bold:
                out.extend(CMD_BOLD_ON)

            # Size
            if item.size == "double_both":
                out.extend(CMD_SIZE_DOUBLE_BOTH)
            elif item.size == "double_height":
                out.extend(CMD_SIZE_DOUBLE_HEIGHT)
            elif item.size == "double_width":
                out.extend(CMD_SIZE_DOUBLE_WIDTH)
            else:
                out.extend(CMD_SIZE_NORMAL)

            # Invert
            if item.inverted:
                out.extend(CMD_INVERT_ON)

            clean_text = sanitize_text(item.text)
            out.extend(clean_text.encode("ascii", errors="replace") + b"\n")

            # Always reset styling to standard left-aligned after each line
            out.extend(CMD_RESET_STYLES)

        elif isinstance(item, Separator):
            sep_str = (item.char * columns)[:columns] + "\n"
            out.extend(sep_str.encode("ascii"))

        elif isinstance(item, Blank):
            out.extend(b"\n" * max(1, item.lines))

        elif isinstance(item, DrawerKick):
            if cash_drawer_kick:
                out.extend(CMD_DRAWER_KICK)

        elif isinstance(item, Cut):
            if print_cut:
                feed = bytes([max(1, min(10, item.feed_lines))])
                # ESC d <feed> followed by GS V 66 0 (partial cut)
                out.extend(ESC + b"d" + feed + GS + b"V\x42\x00")

    return bytes(out)

