import Button from "@mui/material/Button";
import { useRef } from "react";

import styles from "./Detection.module.css";

interface FileButtonProps {
  label: string;
  accept: string;
  disabled: boolean;
  onFile: (file: File) => void;
  className?: string | undefined;
}

/**
 * The original's "Image" / "Video" upload button. The real file input stays in the tab order
 * (visually hidden), so keyboard and screen-reader users can choose a file too.
 */
export function FileButton({ label, accept, disabled, onFile, className }: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <Button
      component="label"
      role={undefined}
      tabIndex={-1}
      variant="contained"
      size="large"
      disabled={disabled}
      className={className}
    >
      {label}
      <input
        ref={input}
        type="file"
        accept={accept}
        disabled={disabled}
        className={styles.visuallyHidden}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear it so choosing the same file again (after a reset) still fires a change.
          if (input.current) input.current.value = "";
          if (file) onFile(file);
        }}
      />
    </Button>
  );
}
