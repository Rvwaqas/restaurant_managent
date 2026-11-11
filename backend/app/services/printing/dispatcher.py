import concurrent.futures
import datetime
import json
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.models import Printer, PrintJob
from app.schemas import PrintJobSchema
from app.services.printing.driver import get_printer_driver
from app.services.printing.escpos import to_escpos
from app.services.printing.network_driver import DriverResult
from app.services.printing.renderers import render_slip
from app.services.printing.simulate_driver import SimulatePrinterDriver
from app.services.printing.text_preview import to_text

logger = logging.getLogger("pos.printing.dispatcher")


def create_queued_print_job(
    db: Session,
    kind: str,
    printer_id: str,
    order_id: Optional[str],
    payload_snapshot: Dict[str, Any],
    category_id: Optional[str] = None,
    category_name: Optional[str] = None,
    printer_name: Optional[str] = None,
) -> PrintJob:
    """
    Creates a queued print job record inside the active transaction.
    Stores payload as a versioned JSON snapshot {"v": 1, ...}.
    """
    if "v" not in payload_snapshot:
        payload_snapshot["v"] = 1

    job_id = f"pj-{uuid.uuid4().hex[:12]}"
    job = PrintJob(
        id=job_id,
        printer_id=printer_id,
        kind=kind,
        status="queued",
        payload=json.dumps(payload_snapshot, default=str),
        attempts=0,
        category_id=category_id,
        category_name=category_name,
        printer_name=printer_name,
        order_id=order_id,
        created_at=now_utc(),
    )
    db.add(job)
    return job


def _send_single_job(
    job_id: str,
    printer: Optional[Printer],
    escpos_bytes: bytes,
    text_repr: str,
    driver: Any,
) -> Tuple[str, DriverResult]:
    if not printer:
        return job_id, DriverResult(ok=False, error="Printer not found")
    try:
        if isinstance(driver, SimulatePrinterDriver):
            res = driver.send(printer, escpos_bytes, job_id=job_id, text_preview=text_repr)
        else:
            res = driver.send(printer, escpos_bytes)
        return job_id, res
    except Exception as ex:
        return job_id, DriverResult(ok=False, error=str(ex))


def dispatch_print_jobs(job_ids: List[str], db: Session) -> List[PrintJobSchema]:
    """
    Dispatches queued print jobs out-of-transaction.
    Catches all network and driver errors so an HTTP endpoint never fails due to printing.
    Returns list of PrintJobSchema conforming to frontend types.
    """
    if not job_ids:
        return []

    driver = get_printer_driver()
    cols = getattr(settings, "PRINT_COLUMNS", 48)
    results: List[PrintJobSchema] = []
    prepared_jobs: List[Dict[str, Any]] = []

    for jid in job_ids:
        try:
            job = db.query(PrintJob).filter(PrintJob.id == jid).first()
            if not job:
                continue

            printer = db.query(Printer).filter(Printer.id == job.printer_id).first()
            p_name = job.printer_name or (f"{printer.name} ({printer.ip})" if printer else "Thermal Printer")
            p_ip = printer.ip if printer else None

            # If already marked printed, do not re-dispatch
            if job.status == "printed":
                results.append(
                    PrintJobSchema(
                        id=job.id,
                        categoryId=job.category_id or "c1",
                        categoryName=job.category_name or "Kitchen",
                        printerId=job.printer_id,
                        printerName=p_name,
                        printerIp=p_ip,
                        status="printed",
                        error=None,
                        printedAt=job.printed_at.isoformat() if job.printed_at else None,
                        kind=job.kind,
                    )
                )
                continue

            try:
                snapshot = json.loads(job.payload or "{}")
            except Exception:
                snapshot = {}

            drawer_kick = False
            if (
                job.kind == "bill"
                and snapshot.get("paymentMethod") == "cash"
                and getattr(settings, "PRINT_CASH_DRAWER_KICK", False)
            ):
                drawer_kick = True

            doc = render_slip(job.kind, snapshot, columns=cols)
            escpos_bytes = to_escpos(
                doc,
                print_cut=getattr(settings, "PRINT_CUT", True),
                cash_drawer_kick=drawer_kick,
                columns=cols,
            )
            text_repr = to_text(doc, columns=cols)

            prepared_jobs.append({
                "job_id": job.id,
                "printer": printer,
                "escpos_bytes": escpos_bytes,
                "text_repr": text_repr,
                "category_id": job.category_id or "c1",
                "category_name": job.category_name or "Kitchen",
                "printer_id": job.printer_id,
                "printer_name": p_name,
                "printer_ip": p_ip,
                "kind": job.kind,
            })
        except Exception as e:
            logger.exception("Error preparing print job %s: %s", jid, e)
            results.append(
                PrintJobSchema(
                    id=jid,
                    categoryId="c1",
                    categoryName="Kitchen",
                    printerId="unknown",
                    printerName="Printer Error",
                    status="failed",
                    error=str(e),
                )
            )

    if not prepared_jobs:
        return results

    # Parallel dispatch across printers capped to ~6 seconds total
    num_workers = min(4, len(prepared_jobs))
    driver_results: Dict[str, DriverResult] = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        future_to_jid = {
            executor.submit(
                _send_single_job,
                item["job_id"],
                item["printer"],
                item["escpos_bytes"],
                item["text_repr"],
                driver,
            ): item["job_id"]
            for item in prepared_jobs
        }

        done, not_done = concurrent.futures.wait(future_to_jid.keys(), timeout=6.0)

        for f in done:
            jid = future_to_jid[f]
            try:
                _, res = f.result()
                driver_results[jid] = res
            except Exception as ex:
                driver_results[jid] = DriverResult(ok=False, error=str(ex))

        for f in not_done:
            jid = future_to_jid[f]
            driver_results[jid] = DriverResult(
                ok=False,
                error="Print dispatch timeout: printer did not complete within 6.0s",
            )

    # Compare-and-set database status update
    for item in prepared_jobs:
        jid = item["job_id"]
        res = driver_results.get(jid, DriverResult(ok=False, error="Unknown error"))

        try:
            job = db.query(PrintJob).filter(PrintJob.id == jid).first()
            if job and job.status in ("queued", "processing"):
                job.attempts = (job.attempts or 0) + 1
                if res.ok:
                    job.status = "printed"
                    job.printed_at = now_utc()
                    job.error = None
                    job.message = res.message or "Printed successfully"
                else:
                    job.status = "failed"
                    job.error = res.error or "Printer unreachable"
                    job.message = res.error or "Printer unreachable"
                db.commit()

            schema_status = "printed" if res.ok else "failed"
            schema_err = None if res.ok else (res.error or "Printer unreachable")
            printed_at_str = job.printed_at.isoformat() if (job and job.printed_at) else None

            results.append(
                PrintJobSchema(
                    id=jid,
                    categoryId=item["category_id"],
                    categoryName=item["category_name"],
                    printerId=item["printer_id"],
                    printerName=item["printer_name"],
                    printerIp=item["printer_ip"],
                    status=schema_status,
                    error=schema_err,
                    printedAt=printed_at_str,
                    kind=item["kind"],
                )
            )
        except Exception as ex:
            logger.exception("Failed to update status for print job %s: %s", jid, ex)
            try:
                db.rollback()
            except Exception:
                pass
            results.append(
                PrintJobSchema(
                    id=jid,
                    categoryId=item["category_id"],
                    categoryName=item["category_name"],
                    printerId=item["printer_id"],
                    printerName=item["printer_name"],
                    status="failed",
                    error=str(ex),
                )
            )

    return results


def _ensure_naive_utc(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return dt


def run_print_queue_recovery(db: Session) -> Dict[str, int]:
    """
    Recover queued jobs at server startup.
    - If created < PRINT_RECOVER_MAX_AGE_MINUTES (10m), re-dispatch with 'delayed': True.
    - If >= 10m, mark failed with 'Expired: server was restarted while queued'.
    """
    max_age_min = getattr(settings, "PRINT_RECOVER_MAX_AGE_MINUTES", 10)
    cutoff = _ensure_naive_utc(now_utc() - datetime.timedelta(minutes=max_age_min))

    queued_jobs = db.query(PrintJob).filter(PrintJob.status == "queued").all()
    if not queued_jobs:
        return {"recovered": 0, "expired": 0}

    to_dispatch_ids: List[str] = []
    recovered_count = 0
    expired_count = 0

    for job in queued_jobs:
        created = _ensure_naive_utc(job.created_at)

        if created and created >= cutoff:
            # Mark delayed flag in snapshot
            try:
                payload = json.loads(job.payload or "{}")
                payload["delayed"] = True
                job.payload = json.dumps(payload)
                db.commit()
            except Exception:
                pass
            to_dispatch_ids.append(job.id)
            recovered_count += 1
        else:
            job.status = "failed"
            job.error = f"Expired: server was restarted while job was queued (>{max_age_min}m ago)"
            job.message = "Expired after restart"
            expired_count += 1
            db.commit()

    if to_dispatch_ids:
        logger.info("Recovering %d queued print job(s) from before restart", len(to_dispatch_ids))
        dispatch_print_jobs(to_dispatch_ids, db)

    return {"recovered": recovered_count, "expired": expired_count}


def cleanup_old_print_jobs(db: Session, retention_days: Optional[int] = None) -> int:
    """
    Deletes print jobs older than retention_days (default settings.PRINT_JOB_RETENTION_DAYS, 60 days).
    """
    days = retention_days or getattr(settings, "PRINT_JOB_RETENTION_DAYS", 60)
    cutoff = _ensure_naive_utc(now_utc() - datetime.timedelta(days=days))

    deleted_count = db.query(PrintJob).filter(PrintJob.created_at < cutoff).delete(synchronize_session=False)
    db.commit()
    if deleted_count > 0:
        logger.info("Cleaned up %d old print job(s) older than %d days", deleted_count, days)
    return deleted_count
