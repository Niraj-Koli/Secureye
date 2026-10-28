import CircularProgress from "@mui/material/CircularProgress";

import styles from "./Card.module.css";

export function Loading() {
  return (
    <div className={styles.centered} role="status">
      <div className={styles.card}>
        <CircularProgress size={100} color="inherit" aria-label="Loading" />
      </div>
    </div>
  );
}
