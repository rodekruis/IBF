from calendar import monthrange
from datetime import datetime


def replace_year_month(dt: datetime, new_year: int, new_month: int):
    """Replace the year and month of a datetime object."""
    try:
        return dt.replace(year=new_year, month=new_month)
    except ValueError:
        # Fallback to the last valid day in the new month
        last_day = monthrange(new_year, new_month)[1]
        return dt.replace(year=new_year, month=new_month, day=last_day)
