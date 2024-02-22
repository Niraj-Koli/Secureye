import { Link } from "react-router-dom";

import { Button } from "@mui/material";

import styles from "./NotFound.module.css";

function NotFound() {
    return (
        <>
            <div className={styles.notFoundContainer}>
                <div className={styles.notFoundCard}>
                    <h1 className={styles.notFoundHeading}>
                        {"Oops ! The Page you are looking for doesn't exists."}
                    </h1>

                    <Button
                        component={Link}
                        to="/"
                        type="button"
                        fullWidth
                        variant="contained"
                        size="large"
                        className={styles.notFoundButton}>
                        {"Return Home"}
                    </Button>
                </div>
            </div>
        </>
    );
}

export default NotFound;
