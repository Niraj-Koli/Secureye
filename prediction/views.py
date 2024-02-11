from ultralytics import YOLO
from django.views.decorators.csrf import csrf_exempt
from PIL import Image
from .forms import ObjectDetectionForm
from .models import PredictedImage
from django.core.files.base import ContentFile
from django.http import JsonResponse
import base64

MODEL_PATH = "D:\\Niru\\Coding\\Projects\\Important\\Secureye\\1\\Secureye\\prediction\\mlModel\\best.pt"

RESULTS_PATH = (
    "D:\\Niru\\Coding\\Projects\\Important\\Secureye\\1\\Secureye\\media\\results.jpg"
)

model = YOLO(MODEL_PATH)


@csrf_exempt
def imagePrediction(request):
    detected_objects = []
    predicted_image = None

    if request.method == "POST":
        form = ObjectDetectionForm(request.POST, request.FILES)

        if form.is_valid():
            image = form.save()

            results = model.predict(source=image.image.path, conf=0.5)

            for result in results:
                im_array = result.plot()
                im = Image.fromarray(im_array[..., ::-1])
                im.save(RESULTS_PATH)

                boxes = result.boxes.cpu().numpy()

                for box in boxes:
                    detected_class = result.names[int(box.cls[0])]
                    confidence_score = round(float(box.conf[0]), 2) * 100

                    detected_objects.append(
                        {"class": detected_class, "confidence": confidence_score}
                    )

            predicted_image = PredictedImage.objects.create()

            with open(
                RESULTS_PATH,
                "rb",
            ) as file:
                content = file.read()
                predicted_image.image.save("predicted_image.jpg", ContentFile(content))

            with open(RESULTS_PATH, "rb") as file:
                encoded_image = base64.b64encode(file.read()).decode("utf-8")

            predicted_image.save()

            image.predicted_image = predicted_image
            image.save()

            return JsonResponse({"objects": detected_objects, "image": encoded_image})
        else:
            return JsonResponse({"error": "Invalid form data"}, status=400)

    return JsonResponse({"error": "Invalid HTTP method"}, status=405)
