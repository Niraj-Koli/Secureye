import { Suspense, lazy, useCallback, useState } from "react";
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
    resetWebcamPrediction,
    resetWebcamDetectedObjects,
} from "@/features/webcam/webcamSlice";

import { startWebcamServerSentEventSource } from "@/features/webcam/webcamActions";

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

    const webcamDetectedObjects = useSelector(
        (state) => state.webcam.webcamDetectedObjects
    );

    const webcamStartHandler = useCallback(() => {
        setIsPredicting(true);

        if (webcamEventSource) {
            dispatch(resetWebcamPrediction());
        }

        dispatch(startWebcamServerSentEventSource()).catch((error) => {
            console.log(error);
        });
    }, [dispatch, webcamEventSource]);

    const webcamStopHandler = useCallback(() => {
        dispatch(resetWebcamPrediction());
        dispatch(resetWebcamDetectedObjects());
        setIsPredicting(false);
    }, [dispatch]);

    const errorDialogCloseHandler = useCallback(() => {
        dispatch(setWebcamError(false));
        dispatch(resetWebcamPrediction());
        dispatch(resetWebcamDetectedObjects());
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

            <div className={styles.reportTableCard}>
                <h1 className={styles.reportTableHeading}>
                    <span>{"Report"}</span>
                </h1>

                <table className={styles.reportTable}>
                    <thead>
                        <tr>
                            <th className={styles.reportHeading}>{"No."}</th>
                            <th className={styles.reportHeading}>
                                {"Objects"}
                            </th>
                            <th className={styles.reportHeading}>
                                {"Timestamps"}
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {webcamDetectedObjects.map((object, index) => (
                            <tr key={index + 1}>
                                <td className={styles.tableCells}>
                                    {index + 1}
                                </td>
                                <td className={styles.tableCells}>
                                    {object.detected_element}
                                </td>
                                <td className={styles.tableCells}>
                                    {object.element_timestamp}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
