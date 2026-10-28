"""Machine-learning layer: detection, tracking, drawing, video processing.

A server must not phone home (usage analytics, connectivity probes) or pip-install packages at
runtime, which Ultralytics does by default. The switches must be set before Ultralytics is first
imported, so they live here: every Ultralytics import in the app goes through this package.
"""

import os

os.environ.setdefault("YOLO_OFFLINE", "1")
os.environ.setdefault("YOLO_AUTOINSTALL", "false")
