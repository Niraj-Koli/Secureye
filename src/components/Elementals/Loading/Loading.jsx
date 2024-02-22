import { CircularProgress } from "@mui/material";

import styles from "./Loading.module.css";

function Loading() {
    return (
        <>
            <div className={styles.loadingContainer}>
                <div className={styles.loadingCard}>
                    <CircularProgress
                        size={100}
                        color="inherit"
                        sx={{ margin: "1rem" }}
                    />
                </div>
            </div>
        </>
    );
}

export default Loading;
