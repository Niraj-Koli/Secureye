import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, CircularProgress } from "@mui/material";

import styles from "./Video.module.css";

import {
    closeServerSendEventSource,
    processVideo,
    startServerSentEventSource,
} from "@/features/video/videoActions";

import Navbar from "@/components/Elementals/Navbar/Navbar";

function Video() {
    const videoRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    // const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    // const [allowPrintPdf, setAllowPrintPdf] = useState(false);
    const [originalVideo, setOriginalVideo] = useState(null);
    const [isPredicting, setIsPredicting] = useState(false);
    const [sseStarted, setSseStarted] = useState(true);
    const [showSpinner, setShowSpinner] = useState(false);

    const dispatch = useDispatch();

    const eventSource = useSelector((state) => state.video.eventSource);
    const videoFrames = useSelector((state) => state.video.videoFrames);

    useEffect(() => {
        if (eventSource) {
            setSseStarted(false);
            return () => {
                dispatch(closeServerSendEventSource);
            };
        }
    }, [dispatch, eventSource]);

    const videoChangeHandler = (event) => {
        const file = event.target.files[0];
        setOriginalVideo(file);
    };

    const videoSubmitHandler = async () => {
        setIsLoading(true);
        setShowSpinner(true);
        setIsPredicting(true);

        try {
            if (eventSource) {
                dispatch(closeServerSendEventSource());
            }

            await dispatch(processVideo(originalVideo));

            await new Promise((resolve) => setTimeout(resolve, 5000));

            await dispatch(startServerSentEventSource());

            setShowSpinner(false);

            // setAllowPrintPdf(true);
        } catch (error) {
            console.log(error);
        } finally {
            setIsLoading(false);
        }
    };

    const closeSseHandler = () => {
        dispatch(closeServerSendEventSource());
        setOriginalVideo(null);
        setIsPredicting(false);
        setSseStarted(true);
    };

    // const downloadPdfHandler = async () => {
    //     try {
    //         setIsGeneratingPdf(true);
    //     } catch (error) {
    //         console.log(error);
    //     } finally {
    //         setIsGeneratingPdf(false);
    //     }
    // };

    return (
        <>
            <div className={styles.videoContainer}>
                <Navbar />

                <div className={styles.uploadButtonCard}>
                    <Button
                        variant="contained"
                        size="large"
                        component="label"
                        className={styles.uploadButton}
                        disabled={isPredicting}>
                        {"Video"}
                        <input
                            type="file"
                            ref={videoRef}
                            onChange={videoChangeHandler}
                            hidden
                            accept="video/*"
                        />
                    </Button>
                </div>

                <div className={styles.predictionCards}>
                    {/* <div className={styles.videoCard}>
                        <div className={styles.videoTemplate}>
                            {originalVideo && (
                                <video
                                    src={URL.createObjectURL(originalVideo)}
                                    controls
                                    className={styles.renderedVideoFrame}
                                />
                            )}
                        </div>
                    </div> */}
                    <div className={styles.videoCard}>
                        <div className={styles.videoTemplate}>
                            {videoFrames.map((frame, index) => (
                                <img
                                    key={index}
                                    src={`data:image/jpeg;base64,${frame}`}
                                    alt="Video Frames"
                                    className={styles.renderedVideoFrame}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className={styles.predictionButtonsActions}>
                    <div className={styles.predictionButtonCard}>
                        {isLoading || showSpinner ? (
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
                                onClick={videoSubmitHandler}
                                disabled={!originalVideo || isLoading}>
                                {"Predict"}
                            </Button>
                        )}
                    </div>

                    <div className={styles.predictionButtonCard}>
                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            className={styles.predictButton}
                            onClick={closeSseHandler}
                            disabled={sseStarted}>
                            {"Stop"}
                        </Button>
                    </div>
                </div>

                {/* <div className={styles.reportTableCard}>
                    <h1 className={styles.reportTableHeading}>
                        <span>{"Report"}</span>
                    </h1>

                    <table className={styles.reportTable}>
                        <thead></thead>
                        <tbody></tbody>
                    </table>

                    {isGeneratingPdf ? (
                        <CircularProgress
                            size={50}
                            color="inherit"
                            sx={{ marginBottom: "2.2rem" }}
                        />
                    ) : (
                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            className={styles.reportDownloadButton}
                            disabled={!allowPrintPdf}
                            onClick={downloadPdfHandler}>
                            {"Print"}
                        </Button>
                    )}
                </div> */}
            </div>

            <div style={{ height: "50rem" }} />
        </>
    );
}

export default Video;
