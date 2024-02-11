from django.contrib import admin
from prediction.models import ObjectDetection, PredictedImage


admin.site.register(ObjectDetection)
admin.site.register(PredictedImage)
