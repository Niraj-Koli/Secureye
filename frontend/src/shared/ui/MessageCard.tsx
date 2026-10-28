import Button from "@mui/material/Button";
import type { ReactNode } from "react";
import { Link } from "react-router";

import styles from "./Card.module.css";

interface MessageCardProps {
  heading: string;
  children?: ReactNode;
}

/** A centred card with a message and a way back home (404 and error screens). */
export function MessageCard({ heading, children }: MessageCardProps) {
  return (
    <main className={styles.centered}>
      <div className={styles.card}>
        <h1 className={styles.heading}>{heading}</h1>
        {children}
        <Button component={Link} to="/" variant="contained" size="large" className={styles.button}>
          Return Home
        </Button>
      </div>
    </main>
  );
}
