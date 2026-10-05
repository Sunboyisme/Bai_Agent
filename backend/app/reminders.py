import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import select
from .db import Session, Reminder, Notification, now

_tick_lock = asyncio.Lock()
STARTED_AT = now()


def utc_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds")


def next_occurrence(due_at: str, recurrence: str, zone: str, after: datetime) -> str:
    local = datetime.fromisoformat(due_at).astimezone(ZoneInfo(zone))
    local_now = after.astimezone(ZoneInfo(zone))
    step = 1 if recurrence == "daily" else 7
    days = max(1, (local_now.date() - local.date()).days // step) * step
    candidate = local + timedelta(days=days)
    while candidate <= local_now:
        candidate += timedelta(days=step)
    return utc_text(candidate)


async def tick() -> None:
    async with _tick_lock:
        current = datetime.now(timezone.utc)
        current_text = utc_text(current)
        with Session() as db:
            due = db.scalars(
                select(Reminder).where(
                    Reminder.status == "active", Reminder.due_at <= current_text
                )
            ).all()
            for reminder in due:
                occurrence = reminder.due_at
                existing = db.scalar(
                    select(Notification).where(
                        Notification.reminder_id == reminder.id,
                        Notification.occurrence_at == occurrence,
                    )
                )
                if not existing:
                    db.add(
                        Notification(
                            reminder_id=reminder.id,
                            occurrence_at=occurrence,
                            title=reminder.title,
                            body=reminder.body,
                            overdue=occurrence < STARTED_AT,
                        )
                    )
                if reminder.recurrence == "none":
                    reminder.status = "fired"
                else:
                    reminder.due_at = next_occurrence(
                        occurrence, reminder.recurrence, reminder.timezone, current
                    )
            db.commit()


def invalidate_notifications(db, reminder_id):
    for note in db.scalars(
        select(Notification).where(
            Notification.reminder_id == reminder_id,
            Notification.status.in_(["pending", "presented"]),
        )
    ):
        note.status = "cancelled"
