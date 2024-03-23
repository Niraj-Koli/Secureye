from django.urls import path
import prediction.views as views

urlpatterns = [
    path("image/", views.imagePrediction, name="imagePrediction"),
    path("video/", views.videoPrediction, name="videoPrediction"),
    path("fetchData/", views.fetchTrackData, name="fetchData"),
    path("videoFrames/", views.videoSSEFrames, name="videoSSEFrames"),
    path("webcamFrames/", views.webcamSSEFrames, name="webcamSSEFrames"),
]
