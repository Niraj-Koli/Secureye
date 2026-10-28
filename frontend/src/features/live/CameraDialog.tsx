import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import { useEffect, useState } from "react";

import { errorMessage } from "@/shared/api/errors";

import { useServerCameras } from "./api";
import styles from "./Live.module.css";
import type { CameraChoice } from "./useLive";

interface CameraDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (choice: CameraChoice) => void;
}

type BrowserCameras =
  | { status: "loading" }
  | { status: "ready"; devices: MediaDeviceInfo[] }
  | { status: "unavailable"; message: string };

/**
 * Lists this device's cameras, which need permission before the browser reveals their names,
 * then the server's cameras.
 */
async function listBrowserCameras(): Promise<BrowserCameras> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent on plain HTTP
  if (!navigator.mediaDevices) {
    return {
      status: "unavailable",
      message: "This browser can only use cameras on secure (HTTPS) pages.",
    };
  }
  let devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === "videoinput",
  );
  if (devices.length > 0 && devices.every((device) => device.label === "")) {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      for (const track of probe.getTracks()) track.stop();
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput",
      );
    } catch {
      return {
        status: "unavailable",
        message: "Camera access was blocked. Allow it in your browser's site settings.",
      };
    }
  }
  return { status: "ready", devices };
}

/** The original's "Choose Webcam" dialog: pick a camera, then Select starts detection. */
export function CameraDialog({ open, onClose, onSelect }: CameraDialogProps) {
  const [browser, setBrowser] = useState<BrowserCameras>({ status: "loading" });
  const [selected, setSelected] = useState("");
  const server = useServerCameras(open);

  useEffect(() => {
    if (!open) return;
    let current = true;
    void listBrowserCameras().then((result) => {
      if (!current) return;
      setBrowser(result);
      const first = result.status === "ready" ? result.devices[0] : undefined;
      setSelected((previous) => previous || (first ? `browser:${first.deviceId}` : ""));
    });
    return () => {
      current = false;
    };
  }, [open]);

  const devices = browser.status === "ready" ? browser.devices : [];
  const cameras = server.data ?? [];

  function choice(): CameraChoice | null {
    const [kind, id = ""] = selected.split(/:(.*)/s);
    if (kind === "browser") {
      const device = devices.find((d) => d.deviceId === id);
      return device
        ? { kind: "browser", deviceId: device.deviceId, label: device.label || "Camera" }
        : null;
    }
    const camera = cameras.find((c) => String(c.id) === id);
    return camera ? { kind: "camera", cameraId: camera.id, label: camera.name } : null;
  }

  const picked = choice();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle className={styles.dialogTitle}>Choose Webcam</DialogTitle>
      <DialogContent>
        {browser.status === "loading" && (
          <div className={styles.dialogLoading} role="status">
            <CircularProgress color="inherit" size={24} aria-hidden /> Looking for cameras…
          </div>
        )}
        {browser.status === "unavailable" && (
          <Alert severity="warning" className={styles.dialogAlert}>
            {browser.message}
          </Alert>
        )}
        {server.isError && (
          <Alert severity="error" className={styles.dialogAlert}>
            {errorMessage(server.error)}
          </Alert>
        )}
        {browser.status !== "loading" && (
          // A radio list rather than a grouped dropdown: MUI's Select announces group headings
          // as choosable options.
          <RadioGroup
            aria-label="Camera"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
            }}
          >
            <p className={styles.group}>This device</p>
            {devices.length === 0 && <p className={styles.none}>No camera found.</p>}
            {devices.map((device, index) => (
              <FormControlLabel
                key={device.deviceId}
                value={`browser:${device.deviceId}`}
                control={<Radio />}
                label={device.label || `Webcam ${String(index + 1)}`}
                className={styles.option}
              />
            ))}
            <p className={styles.group}>Server cameras</p>
            {cameras.length === 0 && <p className={styles.none}>None registered.</p>}
            {cameras.map((camera) => (
              <FormControlLabel
                key={camera.id}
                value={`camera:${String(camera.id)}`}
                control={<Radio />}
                label={camera.name}
                className={styles.option}
              />
            ))}
          </RadioGroup>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={picked === null}
          onClick={() => {
            if (picked) onSelect(picked);
          }}
        >
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
}
