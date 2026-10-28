import LinearProgress from "@mui/material/LinearProgress";
import { Outlet, ScrollRestoration, useNavigation } from "react-router";

import styles from "./RootLayout.module.css";

export function RootLayout() {
  const navigation = useNavigation();

  return (
    <>
      {navigation.state === "loading" && (
        <LinearProgress color="secondary" className={styles.progress} aria-label="Loading page" />
      )}
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
