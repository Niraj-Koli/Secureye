import { useRef, useState } from "react";
import { Button, CircularProgress } from "@mui/material";

import styles from "./Video.module.css";

import Navbar from "@/components/Elementals/Navbar/Navbar";

function Video() {
    const videoRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [originalVideo, setOriginalVideo] = useState(null);
    const [allowPrintPdf, setAllowPrintPdf] = useState(false);

    const videoChangeHandler = (event) => {
        const file = event.target.files[0];
        setOriginalVideo(file);
    };

    const videoSubmitHandler = async () => {
        setIsLoading(true);

        try {
            await new Promise((resolve) => setTimeout(resolve, 2000));
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
                    <div className={styles.videoCard}>
                        <div className={styles.videoTemplate}>
                            {originalVideo && (
                                <video
                                    src={URL.createObjectURL(originalVideo)}
                                    controls
                                    className={styles.renderedVideo}
                                />
                            )}
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
