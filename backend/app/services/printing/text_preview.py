from app.services.printing.document import (
    Blank,
    Cut,
    DrawerKick,
    Separator,
    SlipDocument,
    StyledLine,
    sanitize_text,
)


def to_text(doc: SlipDocument, columns: int = 48) -> str:
    """
    Renders SlipDocument to a clean monospace plain-text preview.
    Matches the receipt layout that prints on physical paper.
    """
    lines = []
    items_to_render = doc.items[:200]
    if len(doc.items) > 200:
        items_to_render.append(StyledLine(text="...", align="center"))

    for item in items_to_render:
        if isinstance(item, StyledLine):
            raw = sanitize_text(item.text)
            # Inverted styling represented cleanly in text preview if not already tagged
            if item.inverted and not raw.startswith("["):
                raw = f"[ {raw.strip()} ]"

            if item.align == "center":
                lines.append(raw.center(columns))
            elif item.align == "right":
                lines.append(raw.rjust(columns))
            else:
                lines.append(raw)

        elif isinstance(item, Separator):
            lines.append((item.char * columns)[:columns])

        elif isinstance(item, Blank):
            for _ in range(max(1, item.lines)):
                lines.append("")

        elif isinstance(item, Cut):
            # Represent cut in text preview
            lines.append("")

        elif isinstance(item, DrawerKick):
            pass

    return "\n".join(lines).strip("\n") + "\n"

