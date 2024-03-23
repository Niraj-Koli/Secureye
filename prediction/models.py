from django.db import models
from django.contrib import admin


class ImageDetectionModel(models.Model):
    id = models.AutoField(primary_key=True)
    record_date = models.DateTimeField(auto_now_add=True)
    image = models.ImageField(upload_to="images/")
    predicted_image = models.ForeignKey(
        "PredictedImage", on_delete=models.SET_NULL, null=True, blank=True
    )

    def __str__(self):
        return str(self.record_date)


class PredictedImage(models.Model):
    record_date = models.DateTimeField(auto_now_add=True)
    image = models.ImageField(upload_to="predicted_images/")

    def __str__(self):
        return str(self.record_date)


class PredictedImageInline(admin.TabularInline):
    model = PredictedImage


class ImageDetectionAdmin(admin.ModelAdmin):
    inlines = [PredictedImageInline]


class Track(models.Model):
    track_id = models.IntegerField()
    class_name = models.CharField(max_length=100)
