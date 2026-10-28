from app.ml.detector import Box, Detection
from app.ml.tracking import ObjectTracker

SHAPE = (240, 320, 3)


def _soldier(x: float) -> Detection:
    return Detection("Soldier", 0.9, Box(x, 10, x + 50, 80))


def _rifle(y: float) -> Detection:
    return Detection("Rifle", 0.7, Box(200, y, 260, y + 40))


def test_ids_are_stable_while_objects_move() -> None:
    tracker = ObjectTracker(["Soldier", "Rifle"])

    frames = [tracker.update([_soldier(10 + 5 * f), _rifle(50 - 3 * f)], SHAPE) for f in range(6)]

    for tracked in frames:
        by_class = {o.detection.class_name: o.track_id for o in tracked}
        assert by_class == {"Soldier": 1, "Rifle": 2}
    # the tracker's (smoothed) box follows the soldier to the right
    assert frames[-1][0].detection.box.x1 > frames[0][0].detection.box.x1


def test_every_tracker_numbers_its_own_objects_from_one() -> None:
    first, second = ObjectTracker(["Soldier"]), ObjectTracker(["Soldier"])

    for f in range(3):  # interleave updates, as two concurrent jobs would
        a = first.update([_soldier(10 + f)], SHAPE)
        b = second.update([_soldier(100 + f)], SHAPE)

    assert [o.track_id for o in a] == [1]
    assert [o.track_id for o in b] == [1]


def test_new_object_gets_the_next_id() -> None:
    tracker = ObjectTracker(["Soldier", "Rifle"])
    for f in range(3):
        tracker.update([_soldier(10 + f)], SHAPE)

    for f in range(3):
        tracked = tracker.update([_soldier(13 + f), _rifle(50)], SHAPE)

    assert sorted(o.track_id for o in tracked) == [1, 2]


def test_empty_frames_and_unknown_classes() -> None:
    tracker = ObjectTracker(["Soldier"])

    assert tracker.update([], SHAPE) == []
    for _ in range(3):
        tracked = tracker.update([Detection("Mystery", 0.9, Box(5, 5, 60, 60))], SHAPE)
    assert [o.detection.class_name for o in tracked] == ["Mystery"]
