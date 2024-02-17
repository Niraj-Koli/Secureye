import { useEffect, useRef, useState } from "react";
import { Button, CircularProgress } from "@mui/material";

import styles from "./Video.module.css";

import Navbar from "@/components/Elementals/Navbar/Navbar";

function Video() {
    const videoRef = useRef(null);
    const eventSourceRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [allowPrintPdf, setAllowPrintPdf] = useState(false);
    const [originalVideo, setOriginalVideo] = useState(null);
    const [videoFrames, setVideoFrames] = useState([]);
    const [displayFrames, setDisplayFrames] = useState(false);

    useEffect(() => {
        setVideoFrames([]);
        setDisplayFrames(false);
    }, [originalVideo]);

    useEffect(() => {
        const eventSource = new EventSource(
            "http://127.0.0.1:8000/prediction/videoFrames/"
        );
        console.log("Connect to SSE at predictFrames", eventSource);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            console.log("Event source opened successfully at predictFrames.");
            setVideoFrames([]);
        };

        eventSource.onerror = (errorEvent) => {
            console.error("Event source error:", errorEvent);
            console.log("Ready state:", eventSource.readyState);
            console.log("Document origin:", document.origin);
            console.log(
                "Request method:",
                errorEvent.currentTarget.withCredentials
                    ? "withCredentials"
                    : "without credentials"
            );
        };

        eventSource.onmessage = (event) => {
            console.log("receiving messages");
            const data = JSON.parse(event.data);
            const imageData = data.image;

            setVideoFrames([imageData]);

            setTimeout(() => {
                setDisplayFrames(true);
            }, 4000);
        };

        return () => {
            eventSourceRef.current.close();
            console.log("Event source connection closed.");
        };
    }, [displayFrames]);

    const videoChangeHandler = (event) => {
        const file = event.target.files[0];
        setOriginalVideo(file);
    };

    const videoSubmitHandler = async () => {
        setIsLoading(true);

        const formData = new FormData();
        formData.append("video", originalVideo);

        try {
            const response = await fetch(
                "http://127.0.0.1:8000/prediction/video/",
                {
                    method: "POST",
                    mode: "cors",
                    body: formData,
                }
            );

            if (response.ok) {
                console.log("Video processing started.");
            } else {
                console.error("Failed to upload video.");
            }

            setAllowPrintPdf(true);
        } catch (error) {
            console.log(error);
        } finally {
            setIsLoading(false);
        }
    };

    const downloadPdfHandler = async () => {
        try {
            setIsGeneratingPdf(true);
        } catch (error) {
            console.log(error);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <>
            <div className={styles.videoContainer}>
                <Navbar />

                <div className={styles.uploadButtonCard}>
                    <Button
                        variant="contained"
                        size="large"
                        component="label"
                        className={styles.uploadButton}>
                        {"Video"}
                        <input
                            type="file"
                            ref={videoRef}
                            onChange={videoChangeHandler}
                            hidden
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

                <div className={styles.predictionButtonCard}>
                    {isLoading ? (
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
                            disabled={isLoading}>
                            {"Predict"}
                        </Button>
                    )}
                </div>

                <div className={styles.reportTableCard}>
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
                </div>
            </div>

            <div style={{ height: "50rem" }} />
        </>
    );
}

export default Video;