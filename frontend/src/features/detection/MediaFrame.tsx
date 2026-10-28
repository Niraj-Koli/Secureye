import type { ReactNode } from "react";

import { cx } from "@/shared/ui/cx";

import styles from "./Detection.module.css";

interface MediaFrameProps {
  /** Names the frame for screen readers, e.g. "Original image". */
  label: string;
  /** The media to show; the original's placeholder picture is shown until there is some. */
  children?: ReactNode;
  busy?: boolean;
  className?: string | undefined;
}

/** The white frame the original used for each image or video panel. */
export function MediaFrame({ label, children, busy = false, className }: MediaFrameProps) {
  return (
    <figure className={cx(styles.frame, className)} aria-label={label} aria-busy={busy}>
      <div className={styles.frameInner}>{children}</div>
    </figure>
  );
}
