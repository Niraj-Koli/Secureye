import cv2
import base64
import json
import tempfile
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.base import ContentFile
from django.utils.translation import gettext_lazy as _
from ultralytics import YOLO
from PIL import Image
from .models import PredictedImage
from .forms import ImageDetectionForm, VideoDetectionForm

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
        form = ImageDetectionForm(request.POST, request.FILES)

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


class VideoProcessor:
    def __init__(self):
        self.temp_video_path = None

    def process_temp_video(self, video_file):
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video.write(video_file.read())
            self.temp_video_path = temp_video.name

    def predict_frames(self):
        cap = cv2.VideoCapture(self.temp_video_path)

        if not cap.isOpened():
            print("Error: Could not open video file.")
            return

        frame_counter = 0
        while True:
            success, frame = cap.read()
            if success:
                results = model(frame, conf=0.5)
                if results:
                    annotated_frame = results[0].plot()
                    _, buffer = cv2.imencode(".jpg", annotated_frame)
                    frame_bytes = buffer.tobytes()
                    base64_data = base64.b64encode(frame_bytes).decode("utf-8")

                    frame_path = f"/predicted_frames/frame_{frame_counter}.jpg"

                    yield f'data: {json.dumps({"image": base64_data, "path": frame_path})}\n\n'
                    print(f"Sent frame {frame_counter}")
                    frame_counter += 1
                else:
                    if frame_counter == cap.get(cv2.CAP_PROP_FRAME_COUNT):
                        print("End of video.")
                    else:
                        print("Error: Failed to read frame from video.")
                    break

        cap.release()


video_processor = VideoProcessor()


@csrf_exempt
def videoPrediction(request):
    try:
        if request.method == "POST":
            form = VideoDetectionForm(request.POST, request.FILES)
            if form.is_valid():
                video_file = form.cleaned_data["video"]
                video_processor.process_temp_video(video_file)
                return JsonResponse({"success": "Video processing started."})
            else:
                return JsonResponse({"error": "Invalid form data"}, status=400)
        return JsonResponse({"error": "Invalid request method"}, status=400)
    except Exception as e:
        print(f"Error in videoFormInput: {str(e)}")
        return JsonResponse({"error": "Internal server error"}, status=500)


@csrf_exempt
def videoSSEFrames(request):
    try:
        response = StreamingHttpResponse(
            video_processor.predict_frames(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "*"
        response["Access-Control-Allow-Headers"] = "*"
        return response
    except Exception as e:
        print(f"Error in sendingFrames: {str(e)}")
        return JsonResponse({"error": "Internal server error"}, status=500)
