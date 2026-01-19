from .travel_tasks import celery_app, generate_travel_itinerary_task, fetch_attractions_task, fetch_restaurants_task

__all__ = [
    "celery_app",
    "generate_travel_itinerary_task",
    "fetch_attractions_task",
    "fetch_restaurants_task",
]
