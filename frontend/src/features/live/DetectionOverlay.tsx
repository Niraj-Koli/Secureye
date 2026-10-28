import { useEffect, useRef } from "react";

import type { Detections } from "./liveConnection";
import styles from "./Live.module.css";

// The Ultralytics 8.0 palette the server uses for its annotated images, by class id, so boxes
// drawn here look like the ones in clips and on the Image and Video pages.
const CLASS_COLORS: Record<string, string> = {
  "Army Vehicle": "#FF3838",
  Handgun: "#FF9D97",
  Helicopter: "#FF701F",
  RPG: "#FFB21D",
  Rifle: "#CFD231",
  Soldier: "#48F90A",
  Tank: "#92CC17",
};
const FALLBACK_COLOR = "#00C2FF";

interface DetectionOverlayProps {
  detections: Detections | null;
  /** The video the boxes belong to (shown with object-fit: contain). */
  video: HTMLVideoElement | null;
}

/** Draws the server's latest detections over the user's own camera video. */
export function DetectionOverlay({ detections, video }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!detections || !video || video.videoWidth === 0) return;

    // Where the video's picture sits inside the element (object-fit: contain).
    const fit = Math.min(width / video.videoWidth, height / video.videoHeight);
    const offsetX = (width - video.videoWidth * fit) / 2;
    const offsetY = (height - video.videoHeight * fit) / 2;
    // Boxes are in the coordinates of the (possibly downscaled) frame that was analysed.
    const scale = (video.videoWidth / detections.width) * fit;

    context.lineWidth = 2;
    context.font = "600 13px Montserrat, sans-serif";
    context.textBaseline = "top";
    for (const object of detections.objects) {
      const color = CLASS_COLORS[object.class_name] ?? FALLBACK_COLOR;
      const x = offsetX + object.box.x1 * scale;
      const y = offsetY + object.box.y1 * scale;
      const w = (object.box.x2 - object.box.x1) * scale;
      const h = (object.box.y2 - object.box.y1) * scale;
      context.strokeStyle = color;
      context.strokeRect(x, y, w, h);

      const label = `id:${String(object.track_id)} ${object.class_name} ${object.confidence.toFixed(2)}`;
      const labelWidth = context.measureText(label).width + 8;
      const labelY = y >= 18 ? y - 18 : y;
      context.fillStyle = color;
      context.fillRect(x, labelY, labelWidth, 18);
      context.fillStyle = "#ffffff";
      context.fillText(label, x + 4, labelY + 2);
    }
  }, [detections, video]);

  return <canvas ref={canvasRef} className={styles.overlay} aria-hidden />;
}
