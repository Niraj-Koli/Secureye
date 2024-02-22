import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from "@mui/material";

import styles from "./Webcam.module.css";

import { setWebcamError } from "@/features/webcam/webcamSlice";

import {
    closeWebcamServerSendEventSource,
    startWebcamServerSentEventSource,
} from "@/features/webcam/webcamActions";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navbar = lazy(() => import("@/components/Elementals/Navbar/Navbar"));
const WebcamServerSentEvents = lazy(() =>
    import(
        "@/components/PredictionSection/WebcamServerSentEvents/WebcamServerSentEvents"
    )
);

function Webcam() {
    const [isPredicting, setIsPredicting] = useState(false);

    const dispatch = useDispatch();

    const webcamEventSource = useSelector(
        (state) => state.webcam.webcamEventSource
    );
    const webcamError = useSelector((state) => state.webcam.webcamError);

    useEffect(() => {
        if (webcamEventSource) {
            return () => {
                dispatch(closeWebcamServerSendEventSource());
            };
        }
    }, [dispatch, webcamEventSource]);

    const webcamStartHandler = useCallback(() => {
        setIsPredicting(true);

        if (webcamEventSource) {
            dispatch(closeWebcamServerSendEventSource());
        }

        dispatch(startWebcamServerSentEventSource()).catch((error) => {
            console.log(error);
        });
    }, [dispatch, webcamEventSource]);

    const webcamStopHandler = useCallback(() => {
        dispatch(closeWebcamServerSendEventSource());
        setIsPredicting(false);
    }, [dispatch]);

    const errorDialogCloseHandler = useCallback(() => {
        dispatch(setWebcamError(false));
        dispatch(closeWebcamServerSendEventSource());
        setIsPredicting(false);
    }, [dispatch]);

    return (
        <>
            <div className={styles.webcamContainer}>
                <Suspense fallback={<Loading />}>
                    <Navbar />
                </Suspense>

                <div className={styles.predictionCards}>
                    <Suspense fallback={<Loading />}>
                        <WebcamServerSentEvents />
                    </Suspense>
                </div>

                <div className={styles.predictionButtonsActions}>
                    <div className={styles.predictionButtonCard}>
                        {isPredicting ? (
                            <CircularProgress
                                size={72}
                                color="inherit"
                                sx={{ margin: "1rem" }}
                            />
                        ) : (
                            <Button
                                variant="contained"
                                size="large"
                                fullWidth
                                className={styles.predictButton}
                                onClick={webcamStartHandler}
                                disabled={isPredicting}>
                                {"Start"}
                            </Button>
                        )}
                    </div>

                    <div className={styles.predictionButtonCard}>
                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            className={styles.predictButton}
                            onClick={webcamStopHandler}
                            disabled={!isPredicting}>
                            {"Stop"}
                        </Button>
                    </div>
                </div>
            </div>

            <Dialog
                fullWidth
                maxWidth="sm"
                open={webcamError}
                onClose={errorDialogCloseHandler}
                classes={{ paper: styles.errorModal }}>
                <DialogTitle className={styles.errorTitle}>
                    {"Webcam Not Found"}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText className={styles.errorMessage}>
                        {
                            "Please check if webcam is accessible or attached to the computer."
                        }
                    </DialogContentText>
                </DialogContent>
                <DialogActions className={styles.errorAction}>
                    <Button
                        fullWidth
                        size="large"
                        onClick={errorDialogCloseHandler}
                        className={styles.errorButton}
                        autoFocus>
                        {"Okay"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default Webcam;
