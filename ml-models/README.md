# Detection models

Custom-trained YOLOv8 weights from the [original Secureye project](https://github.com/Niraj-Koli/Secureye/tree/442796b) (`prediction/mlModel/`),
copied unchanged (verified by SHA-256). They are stored with Git LFS (see the root `.gitattributes`).

| File | Architecture | Size | Used for | Default thresholds |
|---|---|---|---|---|
| `bestM.pt` | YOLOv8m | 52 MB | image and video detection | image: confidence 0.2, IoU 0.3 |
| `bestS.pt` | YOLOv8s | 22 MB | live camera detection (faster) | confidence 0.4, IoU 0.45 (original: 0.0) |

## Classes

Read from the weights (both models share them):

| id | class |
|---|---|
| 0 | Army Vehicle |
| 1 | Handgun |
| 2 | Helicopter |
| 3 | RPG |
| 4 | Rifle |
| 5 | Soldier |
| 6 | Tank |

## Compatibility with the original app

The original app ran these weights with Ultralytics 8.0.228 and PyTorch 2.1; the new backend
uses Ultralytics 8.4 and PyTorch 2.14 (CPU build). `backend/tests/ml/test_detector.py` checks
the new stack against an output the old app produced (`public/afterSliderImage.jpg` in the original project):

- All 5 of the old detections are reproduced (same class, box overlap ≥ 0.9, confidence
  within ±0.05; in practice within ±0.03).
- The newer Ultralytics also reports 2 extra low-confidence soldiers (0.25 and 0.23, just above
  the 0.2 threshold). Raising the threshold to 0.3 removes them.

## Performance (CPU, this development machine)

- Load + warm-up of both models at startup: about 10 s
- `bestM` on a 2880×1920 photo: about 0.6 s per image
- `bestS` on the same photo: about 0.25 s; on 1280×720 live frames, about 250 ms per frame
