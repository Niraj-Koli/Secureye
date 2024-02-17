from django.contrib import admin
from prediction.models import ImageDetectionModel, PredictedImage


admin.site.register(ImageDetectionModel)
admin.site.register(PredictedImage)
