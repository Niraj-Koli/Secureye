import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import type { ReactNode } from "react";

import { cx } from "@/shared/ui/cx";

import styles from "./ResultDialog.module.css";

interface ResultDialogProps {
  open: boolean;
  kind: "success" | "error";
  title: string;
  children: ReactNode;
  /** Label of the single button ("Explore", "Login", "Okay"...). */
  actionLabel: string;
  /** Called by the button, Escape and a click outside alike, as in the original. */
  onClose: () => void;
}

/** The original green/red outcome dialog shown after each account form is submitted. */
export function ResultDialog({
  open,
  kind,
  title,
  children,
  actionLabel,
  onClose,
}: ResultDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { className: styles.paper } }}
    >
      <DialogTitle className={cx(styles.title, styles[kind])}>{title}</DialogTitle>
      <DialogContent className={cx(styles.message, styles[kind])}>{children}</DialogContent>
      <DialogActions className={styles.actions}>
        <Button
          fullWidth
          size="large"
          // The dialog's only control: focusing it is the standard pattern for an alert dialog.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onClick={onClose}
          className={cx(
            styles.button,
            kind === "success" ? styles.successButton : styles.errorButton,
          )}
        >
          {actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
