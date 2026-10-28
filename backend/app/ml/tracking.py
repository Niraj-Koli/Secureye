"""Multi-object tracking (ByteTrack) that is independent of the model.

The original app used `model.track(persist=True)`, which keeps tracker state *on the shared
model object*, so two videos processed at once would mix track ids. Here each video job (and
each live session) owns an `ObjectTracker`, and the model is only used for detection. This is
the same ByteTrack configuration Ultralytics uses by default (`bytetrack.yaml`).
"""

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from app.ml.detector import Box, Detection


@dataclass(frozen=True, slots=True)
class TrackedObject:
    track_id: int
    detection: Detection  # class/confidence from the detector, box smoothed by the tracker


class ObjectTracker:
    def __init__(self, class_names: Sequence[str]) -> None:
        from ultralytics.trackers.byte_tracker import BYTETracker
        from ultralytics.utils import YAML, IterableSimpleNamespace
        from ultralytics.utils.checks import check_yaml

        config = IterableSimpleNamespace(**YAML.load(check_yaml("bytetrack.yaml")))
        self._tracker = BYTETracker(config)
        self._class_names = list(class_names)
        # Ultralytics numbers tracks with a process-wide counter, so ids would continue from
        # the previous video (or interleave with a concurrent one). Renumber per tracker: every
        # video's objects are 1, 2, 3, ... in order of appearance.
        self._ids: dict[int, int] = {}

    def update(
        self, detections: Sequence[Detection], image_shape: tuple[int, ...]
    ) -> list[TrackedObject]:
        """Feed one frame's detections; return the objects tracked in this frame."""
        from ultralytics.engine.results import Boxes

        rows = [
            [d.box.x1, d.box.y1, d.box.x2, d.box.y2, d.confidence, self._class_index(d)]
            for d in detections
        ]
        data = np.asarray(rows, dtype=np.float32).reshape(-1, 6)
        boxes = Boxes(data, orig_shape=(image_shape[0], image_shape[1]))
        output = self._tracker.update(boxes)

        tracked: list[TrackedObject] = []
        # Each row: x1, y1, x2, y2, track_id, score, class, index into `detections`.
        for x1, y1, x2, y2, track_id, _score, _cls, index in output.reshape(-1, 8).tolist():
            source = detections[int(index)]
            box = Box(*(round(v, 1) for v in (x1, y1, x2, y2)))
            local_id = self._ids.setdefault(int(track_id), len(self._ids) + 1)
            tracked.append(
                TrackedObject(
                    track_id=local_id,
                    detection=Detection(source.class_name, source.confidence, box),
                )
            )
        return tracked

    def _class_index(self, detection: Detection) -> int:
        try:
            return self._class_names.index(detection.class_name)
        except ValueError:
            return 0
