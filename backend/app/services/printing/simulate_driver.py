import logging
import os
from typing import Optional

from app.core.config import settings
from app.models import Printer
from app.services.printing.health import record_printer_failure, record_printer_success
from app.services.printing.network_driver import DriverResult

logger = logging.getLogger("pos.printing.simulate_driver")

class SimulatePrinterDriver:
    """
    Simulated printer driver for local testing and dev.
    Writes preview files to PRINT_SIM_DIR and respects SIMULATE_FAIL_PRINTERS.
    """

    def send(
        self,
        printer: Printer,
        payload_bytes: bytes,
        job_id: Optional[str] = None,
        text_preview: Optional[str] = None,
    ) -> DriverResult:
        sim_fails = [
            p.strip()
            for p in getattr(settings, "SIMULATE_FAIL_PRINTERS", "").split(",")
            if p.strip()
        ]

        if printer.id in sim_fails or "ALL" in sim_fails:
            err = f"Simulated printer failure for {printer.id}"
            record_printer_failure(printer.id, err)
            return DriverResult(ok=False, error=err)

        sim_dir = getattr(settings, "PRINT_SIM_DIR", "data/print_sim")
        try:
            os.makedirs(sim_dir, exist_ok=True)
            prefix = job_id or f"sim_{printer.id}"

            # Write binary bytes
            bin_path = os.path.join(sim_dir, f"{prefix}.bin")
            with open(bin_path, "wb") as f:
                f.write(payload_bytes)

            # Write text preview if provided
            if text_preview:
                txt_path = os.path.join(sim_dir, f"{prefix}.txt")
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(text_preview)

        except Exception as e:
            logger.warning("Could not write print simulation file: %s", e)

        record_printer_success(printer.id)
        return DriverResult(
            ok=True,
            message=f"Simulated print successfully processed for {printer.name} ({len(payload_bytes)} bytes)",
        )

