import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.endpoints.auth import load_staff_users, require_admin
from app.core.clock import get_business_date
from app.core.database import get_db
from app.models import Category, Floor
from app.schemas import (
    CategorySalesLegacyRow,
    CategorySalesRow,
    DailyClosingReport,
    DailySalesRow,
    DiscountRow,
    FloorSalesRow,
    PaymentMethodRow,
    PeakHourCell,
    ReportSummary,
    SalesOverTimeBucket,
    TopItemRow,
    User,
    VoidedItemRow,
    WaiterSalesLegacyRow,
    WaiterSalesRow,
)
from app.services import reports as reports_service

router = APIRouter(prefix="/reports", tags=["reports"])


def validate_report_filters(
    db: Session,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    floor_id: Optional[str] = None,
    waiter_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    category_id: Optional[str] = None,
) -> tuple[str, str]:
    today = get_business_date()
    f_date = from_date.strip() if from_date and from_date.strip() else today
    t_date = to_date.strip() if to_date and to_date.strip() else today

    try:
        d_from = datetime.date.fromisoformat(f_date)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format for 'from': '{f_date}'. Expected YYYY-MM-DD.",
        )

    try:
        d_to = datetime.date.fromisoformat(t_date)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format for 'to': '{t_date}'. Expected YYYY-MM-DD.",
        )

    if d_from > d_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Start date ('from') must be less than or equal to end date ('to').",
        )

    if (d_to - d_from).days > 400:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date range cannot exceed 400 days.",
        )

    if payment_method and payment_method not in ("cash", "card", "online"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid paymentMethod '{payment_method}'. Allowed values: 'cash', 'card', 'online'.",
        )

    if floor_id and floor_id != "all":
        floor = db.query(Floor).filter(Floor.id == floor_id).first()
        if not floor:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Floor '{floor_id}' not found.",
            )

    if category_id:
        cat = db.query(Category).filter(Category.id == category_id).first()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Category '{category_id}' not found.",
            )

    if waiter_id:
        staff_users = load_staff_users()
        if not any(u["id"] == waiter_id or u["username"] == waiter_id for u in staff_users):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Waiter '{waiter_id}' not found.",
            )

    return f_date, t_date


@router.get("/summary", response_model=ReportSummary)
def get_summary(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, payment_method=paymentMethod, category_id=categoryId
    )
    return reports_service.get_summary(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        waiter_id=waiterId,
        payment_method=paymentMethod,
        category_id=categoryId,
    )


@router.get("/sales-over-time", response_model=List[SalesOverTimeBucket])
def get_sales_over_time(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    groupBy: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if groupBy and groupBy not in ("hour", "day", "month"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid groupBy '{groupBy}'. Allowed values: 'hour', 'day', 'month'.",
        )

    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, payment_method=paymentMethod, category_id=categoryId
    )
    return reports_service.get_sales_over_time(
        db=db,
        from_date=f_date,
        to_date=t_date,
        group_by=groupBy,
        floor_id=floorId,
        waiter_id=waiterId,
        payment_method=paymentMethod,
        category_id=categoryId,
    )


@router.get("/by-category", response_model=List[CategorySalesRow])
def get_by_category(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, payment_method=paymentMethod
    )
    return reports_service.get_by_category(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        waiter_id=waiterId,
        payment_method=paymentMethod,
    )


@router.get("/by-floor", response_model=List[FloorSalesRow])
def get_by_floor(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, waiter_id=waiterId, payment_method=paymentMethod, category_id=categoryId
    )
    return reports_service.get_by_floor(
        db=db,
        from_date=f_date,
        to_date=t_date,
        waiter_id=waiterId,
        payment_method=paymentMethod,
        category_id=categoryId,
    )


@router.get("/by-waiter", response_model=List[WaiterSalesRow])
def get_by_waiter(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, payment_method=paymentMethod, category_id=categoryId
    )
    return reports_service.get_by_waiter(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        payment_method=paymentMethod,
        category_id=categoryId,
    )


@router.get("/top-items", response_model=List[TopItemRow])
def get_top_items(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("amount"),
    order: str = Query("desc"),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if sort not in ("qty", "amount"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid sort '{sort}'. Allowed values: 'qty', 'amount'.",
        )
    if order not in ("asc", "desc"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid order '{order}'. Allowed values: 'asc', 'desc'.",
        )

    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, payment_method=paymentMethod, category_id=categoryId
    )
    return reports_service.get_top_items(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        waiter_id=waiterId,
        payment_method=paymentMethod,
        category_id=categoryId,
        limit=limit,
        sort=sort,
        order=order,
    )


@router.get("/by-payment-method", response_model=List[PaymentMethodRow])
def get_by_payment_method(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, category_id=categoryId
    )
    return reports_service.get_by_payment_method(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        waiter_id=waiterId,
        category_id=categoryId,
    )


@router.get("/peak-hours", response_model=List[PeakHourCell])
def get_peak_hours(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, payment_method=paymentMethod, category_id=categoryId
    )
    return reports_service.get_peak_hours(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        waiter_id=waiterId,
        payment_method=paymentMethod,
        category_id=categoryId,
    )


@router.get("/discounts", response_model=List[DiscountRow])
def get_discounts(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    paymentMethod: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, payment_method=paymentMethod, category_id=categoryId
    )
    return reports_service.get_discounts(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        waiter_id=waiterId,
        payment_method=paymentMethod,
        category_id=categoryId,
    )


@router.get("/voided-items", response_model=List[VoidedItemRow])
def get_voided_items(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    waiterId: Optional[str] = Query(None),
    categoryId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    f_date, t_date = validate_report_filters(
        db, from_date=from_, to_date=to, floor_id=floorId, waiter_id=waiterId, category_id=categoryId
    )
    return reports_service.get_voided_items(
        db=db,
        from_date=f_date,
        to_date=t_date,
        floor_id=floorId,
        waiter_id=waiterId,
        category_id=categoryId,
    )


@router.get("/daily-closing", response_model=DailyClosingReport)
def get_daily_closing(
    date: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    today = get_business_date()
    target_date = date.strip() if date and date.strip() else today
    try:
        datetime.date.fromisoformat(target_date)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format for 'date': '{target_date}'. Expected YYYY-MM-DD.",
        )

    if floorId and floorId != "all":
        floor = db.query(Floor).filter(Floor.id == floorId).first()
        if not floor:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Floor '{floorId}' not found.",
            )

    return reports_service.get_daily_closing(
        db=db,
        date=target_date,
        floor_id=floorId,
    )


# Legacy endpoints (for backward compatibility)
@router.get("/daily-sales", response_model=List[DailySalesRow])
def get_daily_sales(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return reports_service.get_daily_sales_legacy(db=db, from_date=from_, to_date=to, floor_id=floorId)


@router.get("/category-sales", response_model=List[CategorySalesLegacyRow])
def get_category_sales(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    floorId: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return reports_service.get_category_sales_legacy(db=db, from_date=from_, to_date=to, floor_id=floorId)


@router.get("/waiter-sales", response_model=List[WaiterSalesLegacyRow])
def get_waiter_sales(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return reports_service.get_waiter_sales_legacy(db=db, from_date=from_, to_date=to)

