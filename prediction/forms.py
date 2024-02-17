from django import forms
from .models import ImageDetectionModel


class ImageDetectionForm(forms.ModelForm):
    class Meta:
        model = ImageDetectionModel
        fields = ["image"]


class VideoDetectionForm(forms.Form):
    video = forms.FileField()
