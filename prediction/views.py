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
from collections import defaultdict
import numpy as np
MODEL_PATH = "D:\\Placements\\Internships\\Major Project Internship\\samples\\INTERNS\\runs\\detect\\train\\weights\\best.pt"


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

            results = model.predict(source=image.image.path, conf=0.3)

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


# class VideoProcessor:
#     def __init__(self):
#         self.temp_video_path = None

#     def process_temp_video(self, video_file):
#         with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
#             temp_video.write(video_file.read())
#             self.temp_video_path = temp_video.name

#     def predict_frames(self):
#         cap = cv2.VideoCapture(self.temp_video_path)

#         if not cap.isOpened():
#             print("Error: Could not open video file.")
#             return

#         frame_counter = 0

#         while True:
#             success, frame = cap.read()
#             if success:
#                 results = model(frame, conf=0.5)
#                 if results:
#                     annotated_frame = results[0].plot()
#                     _, buffer = cv2.imencode(".jpg", annotated_frame)
#                     frame_bytes = buffer.tobytes()
#                     base64_data = base64.b64encode(frame_bytes).decode("utf-8")

#                     frame_path = f"/predicted_frames/frame_{frame_counter}.jpg"

#                     yield f'data: {json.dumps({"image": base64_data, "path": frame_path})}\n\n'
#                     print(f"Sent frame {frame_counter}")
#                     frame_counter += 1
#                 else:
#                     if frame_counter == cap.get(cv2.CAP_PROP_FRAME_COUNT):
#                         print("End of video.")
#                     else:
#                         print("Error: Failed to read frame from video.")
#                     break

#         cap.release()



class VideoProcessor:
    def __init__(self):
        self.temp_video_path = None

    def process_temp_video(self, video_file):
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video.write(video_file.read())
            self.temp_video_path = temp_video.name

    def predict_frames(self):
        cap = cv2.VideoCapture(self.temp_video_path)
        target_fps = 30
        track_history = defaultdict(lambda: [])
        processed_track_ids = set()  # Set to store processed track IDs
        video_writers = {}

        if not cap.isOpened():
            print("Error: Could not open video file.")
            return

        frame_counter = 0
        while True:
            success, frame = cap.read()
            if success:
                frame_counter += 1

                if frame_counter % 4 == 0:
                    continue

                results = model.track(frame, verbose=False, persist=True, conf=0.4, iou=0.0, tracker="bytetrack.yaml")
                
                annotated_frame = results[0].plot(conf = False, line_width = 1)
                
                _, buffer = cv2.imencode('.jpg', annotated_frame)
                frame_bytes = buffer.tobytes()
                base64_data = base64.b64encode(frame_bytes).decode('utf-8')
                frame_path = f'/predicted_frames/frame_{frame_counter}.jpg'  

                if results :
                    if results[0].boxes.id is not None:

                    
                        # print("Track id detected")
                        boxes = results[0].boxes.xywh.cpu()
                        track_ids = results[0].boxes.id.int().cpu().tolist()
                        class_ids = results[0].boxes.cls.int().cpu().tolist()  # Extract class IDs

                        for box, track_id, class_id in zip(boxes, track_ids, class_ids):
                            if track_id == -1:  # Skip if track ID is -1 (no detection)
                                continue

                            x, y, w, h = box
                            track = track_history[track_id]
                            track.append((float(x), float(y)))  # x, y center point
                            if len(track) > 50:  # Retain 90 tracks for 90 frames
                                track.pop(0)

                            # Draw the tracking lines
                            points = np.hstack(track).astype(np.int32).reshape((-1, 1, 2))
                            cv2.polylines(annotated_frame, [points], isClosed=False, color=(230, 230, 230), thickness=10)

                            # Get the class name corresponding to the class ID from the results
                            class_name = results[0].names[class_id]

                            # Add track ID and class name to processed_track_ids set
                            processed_track_ids.add((track_id,class_name))
                            if track_id not in video_writers:
                                output_video_path = f"track_id_{track_id}_{class_name}.mp4"
                                fourcc = cv2.VideoWriter_fourcc(*'XVID')
                                video_writer = cv2.VideoWriter(output_video_path, fourcc, target_fps, (frame.shape[1], frame.shape[0]))
                                video_writers[track_id] = video_writer

                            # Write frame to video writer
                            video_writers[track_id].write(frame)

                        yield f'data: {json.dumps({"image": base64_data, "path": frame_path})}\n\n' 
                        # print(f"Sent frame {frame_counter}")
                    else: 
                        # print("No track id detected")
                        yield f'data: {json.dumps({"image": base64_data, "path": frame_path})}\n\n' 

                else:
                    print("Something problem related to Results")

                    
                    if frame_counter == cap.get(cv2.CAP_PROP_FRAME_COUNT):
                        print("End of video.")
                    else:
                        print("Error: Failed to read frame from video.")

            else:
                print("Error: Failed to read frame from video., outer else part")
                break

        # Release video capture and close windows
        cap.release()
        cv2.destroyAllWindows()

        # Release video writers
        for video_writer in video_writers.values():
            video_writer.release()

        tracked_cls_List = list(processed_track_ids)
        sorted_tracked_items_list = sorted(tracked_cls_List, key=lambda x: x[0])

        print(sorted_tracked_items_list) # there should some way, which can be used to extract only class_names

        return sorted_tracked_items_list


video_processor = VideoProcessor()


class VideoProcessor:
    def __init__(self):
        self.temp_video_path = None

    def process_temp_video(self, video_file):
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video.write(video_file.read())
            self.temp_video_path = temp_video.name

    def predict_frames(self):
        cap = cv2.VideoCapture(self.temp_video_path)
        target_fps = 15
        track_history = defaultdict(lambda: [])
        processed_track_ids = set()  # Set to store processed track IDs
        video_writers = {}

        if not cap.isOpened():
            print("Error: Could not open video file.")
            return

        frame_counter = 0
        while True:
            success, frame = cap.read()
            if success:
                frame_counter += 1

                if frame_counter % 2 == 0:
                    continue

                results = model.track(frame, verbose=False, persist=True, conf=0.5, iou=0.0, tracker="bytetrack.yaml")

                if results and results[0].boxes.id is not None:
                    boxes = results[0].boxes.xywh.cpu()
                    track_ids = results[0].boxes.id.int().cpu().tolist()
                    class_ids = results[0].boxes.cls.int().cpu().tolist()  # Extract class IDs

                    # Visualize the results on the frame
                    annotated_frame = results[0].plot()

                    for box, track_id, class_id in zip(boxes, track_ids, class_ids):
                        if track_id == -1:  # Skip if track ID is -1 (no detection)
                            continue

                        x, y, w, h = box
                        track = track_history[track_id]
                        track.append((float(x), float(y)))  # x, y center point
                        if len(track) > 30:  # Retain 90 tracks for 90 frames
                            track.pop(0)

                        # Draw the tracking lines
                        points = np.hstack(track).astype(np.int32).reshape((-1, 1, 2))
                        cv2.polylines(annotated_frame, [points], isClosed=False, color=(230, 230, 230), thickness=10)

                        # Get the class name corresponding to the class ID from the results
                        class_name = results[0].names[class_id]

                        # Add track ID and class name to processed_track_ids set
                        processed_track_ids.add((track_id, class_name))

                        # Check if track ID exists in video writers dictionary
                        if track_id not in video_writers:
                            # Create a new video writer for the track ID
                            output_video_path = f"track_id_{track_id}_{class_name}.avi"
                            fourcc = cv2.VideoWriter_fourcc(*'XVID')
                            video_writer = cv2.VideoWriter(output_video_path, fourcc, target_fps, (frame.shape[1], frame.shape[0]))
                            video_writers[track_id] = video_writer

                        # Write the annotated frame to the corresponding video writer
                        video_writers[track_id].write(annotated_frame)

                    # Send the frame data and path to the frontend through SSE
                    _, buffer = cv2.imencode('.jpg', annotated_frame)
                    frame_bytes = buffer.tobytes()
                    base64_data = base64.b64encode(frame_bytes).decode('utf-8')
                    frame_path = f'/predicted_frames/frame_{frame_counter}.jpg'
                    # yield f'data: {json.dumps({"image": base64_data, "path": frame_path})}\n\n'

                    print(f"Detections are: Track_ID {track_id} : {class_name}")
                    #yield f'data: {json.dumps({"image": base64_data, "path": frame_path, "track_id": track_id, "class_id": class_id})}\n\n' 
                    yield f'data: {json.dumps({"track_id": track_id, "class_name": class_name})}\n\n' 
                    print(f"Sent frame {frame_counter}")

                else:
                    if frame_counter == cap.get(cv2.CAP_PROP_FRAME_COUNT):
                        print("End of video.")
                    else:
                        print("Error: Failed to read frame from video.")

            else:
                print("Error: Failed to read frame from video.")
                break

        # Release video capture and close windows
        cap.release()
        cv2.destroyAllWindows()

        # Release video writers
        for video_writer in video_writers.values():
            video_writer.release()

        print("Tracked items are: ", processed_track_ids)































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


@csrf_exempt
def webcamSSEFrames(request):
    def event_stream():
        cap = cv2.VideoCapture(0)

        if not cap.isOpened():
            print("Error: Could not open webcam.")
            return

        try:
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

                        # Generate a unique path for each frame
                        frame_path = f"/predicted_frames/frame_{frame_counter}.jpg"

                        # Send the frame data and path to the frontend through SSE
                        yield f'data: {{ "image": "{base64_data}","path": "{frame_path}"}}\n\n'

                        frame_counter += 1
                else:
                    print("Error: Failed to read frame from webcam.")
                    break

        except Exception as e:
            print("Error in predictFrames:", str(e))
        finally:
            cap.release()

    return StreamingHttpResponse(event_stream(), content_type="text/event-stream")
