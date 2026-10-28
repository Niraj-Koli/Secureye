import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";

import styles from "./Detection.module.css";

export interface Clip {
  /** e.g. "Soldier #3 · first seen at 2.10 sec" */
  title: string;
  /** Accessible name of the video, e.g. "Clip of Soldier 3". */
  label: string;
  url: string;
  downloadName: string;
}

interface ClipDialogProps {
  clip: Clip | null;
  onClose: () => void;
}

/** New: plays the clip saved for one tracked object (the original saved them but never showed them). */
export function ClipDialog({ clip, onClose }: ClipDialogProps) {
  return (
    <Dialog open={clip !== null} onClose={onClose} fullWidth maxWidth="md">
      {clip && (
        <>
          <DialogTitle className={styles.clipTitle}>{clip.title}</DialogTitle>
          <DialogContent>
            <video
              src={clip.url}
              controls
              autoPlay
              muted
              className={styles.clip}
              aria-label={clip.label}
            />
          </DialogContent>
          <DialogActions>
            <Button component="a" href={clip.url} download={clip.downloadName}>
              Download
            </Button>
            <Button variant="contained" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
