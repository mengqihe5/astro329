from django.urls import path

from app01 import views


urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("articles/", views.articles, name="articles"),
    path("articles/<slug:slug>/", views.article_detail, name="article_detail"),
    path("steam/", views.steam, name="steam"),
    path("books/", views.bookshelf, name="bookshelf"),
    path("books/<slug:slug>/", views.book_detail, name="book_detail"),
]
