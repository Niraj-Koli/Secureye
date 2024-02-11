from django.urls import path
import prediction.views as views

urlpatterns = [
    path("image/", views.imagePrediction, name="imagePrediction"),
]
