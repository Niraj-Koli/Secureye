import os
import cv2
import base64
import json
import tempfile
import numpy as np
import time
from datetime import datetime
from django.http import JsonResponse, StreamingHttpResponse
from io import BytesIO
from django.views.decorators.csrf import csrf_exempt
from django.core.files.base import ContentFile
from django.utils.translation import gettext_lazy as _
from ultralytics import YOLO
from PIL import Image
from .models import PredictedImage, Track
from .forms import ImageDetectionForm, VideoDetectionForm
from collections import defaultdict
from django.core.serializers import serialize


MODEL_PATH = "D:\\Niru\\Coding\\Projects\\Important\\Secureye\\2\\Secureye\\prediction\\mlModel\\best.pt"

model = YOLO(MODEL_PATH)


@csrf_exempt
def imagePrediction(request):
    if request.method == "POST":
        form = ImageDetectionForm(request.POST, request.FILES)

        if form.is_valid():
            image = form.save()

            results = model.predict(source=image.image.path, conf=0.5)

            detected_objects = []
            for result in results:
                boxes = result.boxes.cpu().numpy()

                for box in boxes:
                    detected_class = result.names[int(box.cls[0])]
                    confidence_score = round(float(box.conf[0]), 2) * 100

                    detected_objects.append(
                        {
                            "detected_class": detected_class,
                            "detected_confidence": confidence_score,
                        }
                    )

            predicted_image = PredictedImage.objects.create()

            im_array = results[0].plot()
            im = Image.fromarray(im_array[..., ::-1])
            buffer = BytesIO()
            im.save(buffer, format="JPEG")
            encoded_image = base64.b64encode(buffer.getvalue()).decode("utf-8")
            buffer.close()

            predicted_image.image.save(
                "predicted_image.jpg", ContentFile(encoded_image)
            )
            predicted_image.save()

            image.predicted_image = predicted_image
            image.save()

            return JsonResponse(
                {
                    "image_detected_objects": detected_objects,
                    "predicted_image": encoded_image,
                }
            )
        else:
            errors = form.errors.as_json()
            return JsonResponse({"error": errors}, status=400)

    return JsonResponse({"error": "Invalid HTTP Method In Image API"}, status=405)


sorted_tracked_items_list = []


class VideoProcessor:
    video_processing_complete = False

    def _init_(self):
        self.temp_video_path = None

    def process_temp_video(self, video_file, video_file_path):
        self.video_processing_complete = False
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video.write(video_file.read())
            self.temp_video_path = temp_video.name
            video_file_name = video_file.name
            self.video_file_path = os.path.join(
                "media", "video_snippets", video_file_name
            )
            if not os.path.exists(self.video_file_path):
                os.makedirs(self.video_file_path)

    def predict_frames(self):
        cap = cv2.VideoCapture(self.temp_video_path)
        target_fps = 30
        track_history = defaultdict(lambda: [])
        timestamps = defaultdict(float)
        processed_track_ids = set()
        video_writers = {}
        target_fps = 10
        timestamp = 0

        if not cap.isOpened():
            print("Error: Could not open video file.")
            return

        frame_counter = 0

        try:
            while not self.video_processing_complete:
                success, frame = cap.read()
                if success:

                    timestamp = frame_counter / cap.get(cv2.CAP_PROP_FPS)

                    frame_counter += 1

                    skip_factor = int(30 / target_fps)

                    if frame_counter % skip_factor != 0:
                        continue

                    results = model.track(
                        frame,
                        verbose=False,
                        persist=True,
                        conf=0.4,
                        iou=0.0,
                        tracker="bytetrack.yaml",
                    )

                    annotated_frame = results[0].plot(conf=False, line_width=2)

                    _, buffer = cv2.imencode(".jpg", annotated_frame)
                    frame_bytes = buffer.tobytes()
                    base64_data = base64.b64encode(frame_bytes).decode("utf-8")

                    if results:
                        if results[0].boxes.id is not None:
                            boxes = results[0].boxes.xywh.cpu()
                            track_ids = results[0].boxes.id.int().cpu().tolist()
                            class_ids = results[0].boxes.cls.int().cpu().tolist()

                            for box, track_id, class_id in zip(
                                boxes, track_ids, class_ids
                            ):
                                if track_id == -1:
                                    continue

                                if timestamps[track_id] == 0.0:
                                    timestamps[track_id] = timestamp

                                x, y, w, h = box
                                track = track_history[track_id]
                                track.append((float(x), float(y)))

                                if len(track) > 50:
                                    track.pop(0)

                                points = (
                                    np.hstack(track)
                                    .astype(np.int32)
                                    .reshape((-1, 1, 2))
                                )
                                cv2.polylines(
                                    annotated_frame,
                                    [points],
                                    isClosed=False,
                                    color=(230, 230, 230),
                                    thickness=10,
                                )

                                class_name = results[0].names[class_id]

                                processed_track_ids.add((track_id, class_name))

                                if track_id not in video_writers:
                                    snippet_counter = 1
                                    while True:
                                        folder_path = (
                                            f"{self.video_file_path}_{snippet_counter}"
                                        )
                                        output_video_path = os.path.join(
                                            folder_path,
                                            f"track_id_{track_id}_{class_name}.mp4",
                                        )
                                        if not os.path.exists(output_video_path):
                                            break
                                        snippet_counter += 1

                                    os.makedirs(
                                        os.path.dirname(output_video_path),
                                        exist_ok=True,
                                    )
                                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                                    video_writer = cv2.VideoWriter(
                                        output_video_path,
                                        fourcc,
                                        target_fps,
                                        (frame.shape[1], frame.shape[0]),
                                    )
                                    video_writers[track_id] = video_writer

                                video_writers[track_id].write(frame)

                            yield f'data: {json.dumps({"video_frame": base64_data})}\n\n'
                        else:
                            yield f'data: {json.dumps({"video_frame": base64_data})}\n\n'

                    else:
                        print("Something problem related to Results")
                else:
                    print("Error: Failed to read frame from video., outer else part")
                    break
        finally:
            cap.release()

            for video_writer in video_writers.values():
                video_writer.release()

            tracked_cls_List = list(processed_track_ids)
            sorted_tracked_items_list = sorted(tracked_cls_List, key=lambda x: x[0])

            for track_id, class_name in sorted_tracked_items_list:
                timestamp = timestamps.get(track_id, 0.0)
                Track.objects.create(
                    track_id=track_id, class_name=class_name, timestamp=timestamp
                )
            cap.release()

            self.video_processing_complete = True


video_processor = VideoProcessor()


@csrf_exempt
def videoPrediction(request):
    try:
        if request.method == "POST":
            form = VideoDetectionForm(request.POST, request.FILES)
            if form.is_valid():
                video_file = form.cleaned_data["video"]

                video_file_name = video_file.name
                video_file_path = os.path.join(
                    "media", "video_snippets", video_file_name
                )

                video_processor.process_temp_video(video_file, video_file_path)

                Track.objects.all().delete()
                return JsonResponse({"success": "Video processing started."})
            else:
                return JsonResponse({"error": "Invalid form data"}, status=400)
        return JsonResponse({"error": "Invalid request method"}, status=400)
    except Exception as e:
        print(f"Error in videoFormInput: {str(e)}")
        return JsonResponse({"error": "Internal server error"}, status=500)


@csrf_exempt
def fetchTrackData(request):
    if request.method == "GET":
        if not Track.objects.exists():
            print("Database is empty")
            return JsonResponse({"error": "Database is empty"}, status=400)

        tracked_items = Track.objects.all()

        serialized_data = serialize("json", tracked_items)
        deserialized_data = json.loads(serialized_data)

        simplified_data = []

        for track in deserialized_data:
            track_fields = track["fields"]
            simplified_track = {
                "track_id": track_fields["track_id"],
                "detected_class": track_fields["class_name"],
                "detected_timestamps": track_fields["timestamp"],
            }
            simplified_data.append(simplified_track)

        return JsonResponse({"video_detected_objects": simplified_data}, safe=False)
    else:
        print("Invalid request method")
        return JsonResponse({"error": "Invalid request method"}, status=400)


@csrf_exempt
def videoSSEFrames(request):
    try:
        response = StreamingHttpResponse(
            video_processor.predict_frames(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["Access-Control-Allow-Origin"] = "*"

        return response
    except Exception as e:
        print(f"Error in sendingFrames: {str(e)}")
        return JsonResponse({"error": "Internal server error"}, status=500)


@csrf_exempt
def webcamSSEFrames(request):
    def event_stream():
        cap = cv2.VideoCapture(0)

        target_fps = 30
        track_history = defaultdict(lambda: [])
        processed_track_ids = set()

        video_writers = {}
        target_fps = 10
        current_time = time.time()
        elements_sent = []

        if not cap.isOpened():
            print("Error: Could not open webcam.")
            return

        frame_counter = 0

        try:

            while True:
                success, frame = cap.read()
                if success:
                    frame_counter += 1

                    skip_factor = int(30 / target_fps)

                    if frame_counter % skip_factor != 0:
                        continue

                    results = model.track(
                        frame,
                        verbose=False,
                        persist=True,
                        conf=0.4,
                        iou=0.0,
                        tracker="bytetrack.yaml",
                    )
                    annotated_frame = results[0].plot(conf=False, line_width=2)

                    _, buffer = cv2.imencode(".jpg", annotated_frame)
                    frame_bytes = buffer.tobytes()
                    base64_data = base64.b64encode(frame_bytes).decode("utf-8")
                    processed_track_ids = set()

                    if results:
                        if results and results[0].boxes.id is not None:

                            boxes = results[0].boxes.xywh.cpu()
                            track_ids = results[0].boxes.id.int().cpu().tolist()
                            class_ids = results[0].boxes.cls.int().cpu().tolist()

                            for box, track_id, class_id in zip(
                                boxes, track_ids, class_ids
                            ):
                                if track_id == -1:
                                    continue

                                x, y, w, h = box
                                track = track_history[track_id]
                                track.append((float(x), float(y)))

                                if len(track) > 50:
                                    track.pop(0)

                                class_name = results[0].names[class_id]

                                current_date = datetime.now().strftime("%d %B %Y")
                                current_time = datetime.now()
                                video_file_path = os.path.join(
                                    "media",
                                    "webcam_footage",
                                )

                                if track_id not in video_writers:
                                    folder_path = os.path.join(
                                        video_file_path, current_date
                                    )
                                    output_video_path = os.path.join(
                                        folder_path,
                                        f"{current_time.strftime('%I%M%S%p').lower()}track_id{track_id}_{class_name}.mp4",
                                    )

                                    os.makedirs(folder_path, exist_ok=True)

                                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                                    video_writer = cv2.VideoWriter(
                                        output_video_path,
                                        fourcc,
                                        target_fps,
                                        (frame.shape[1], frame.shape[0]),
                                    )
                                    video_writers[track_id] = video_writer
                                video_writers[track_id].write(annotated_frame)

                                processed_track_ids.add((track_id, class_name))
                            unique_list = []

                            for track_id, class_name in processed_track_ids:
                                element = f"trackId {track_id} {class_name}"
                                if element not in unique_list:
                                    unique_list.append(element)

                            for element in unique_list:
                                if element not in elements_sent:
                                    elements_sent.append(element)
                                    timestamp = datetime.now().strftime(
                                        "%d-%B-%Y %I:%M %p"
                                    )
                                    class_name = element.split()[-1]
                                    data = {
                                        "webcam_frame": base64_data,
                                        "detected_object": {
                                            "detected_element": class_name,
                                            "element_timestamp": timestamp,
                                        },
                                    }

                                    yield f"data: {json.dumps(data)}\n\n"
                                else:
                                    yield f'data: {json.dumps({"webcam_frame": base64_data})}\n\n'
                        else:
                            yield f'data: {json.dumps({"webcam_frame": base64_data})}\n\n'
                    else:

                        print("something wrong with the results and track_info")
                else:
                    print("Error: Failed to read frame from webcam.")
                    break

        except Exception as e:
            print("Error in webcamSSE:", str(e))
        finally:
            cap.release()
            for video_writer in video_writers.values():
                video_writer.release()

    return StreamingHttpResponse(event_stream(), content_type="text/event-stream")