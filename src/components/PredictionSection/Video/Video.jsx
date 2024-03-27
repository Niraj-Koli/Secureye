import jsPDF from "jspdf";
import "jspdf-autotable";

import {
    Suspense,
    lazy,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import { Button, CircularProgress } from "@mui/material";

import styles from "./Video.module.css";

import {
    resetVideoPrediction,
    resetVideoDetectedObjects,
} from "@/features/video/videoSlice";

import {
    processVideo,
    fetchVideoTrackInfo,
    startVideoServerSentEventSource,
} from "@/features/video/videoActions";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navbar = lazy(() => import("@/components/Elementals/Navbar/Navbar"));
const VideoServerSentEvents = lazy(() =>
    import(
        "@/components/PredictionSection/VideoServerSentEvents/VideoServerSentEvents"
    )
);

function Video() {
    const videoRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isPredicting, setIsPredicting] = useState(false);
    const [sseStarted, setSseStarted] = useState(true);
    const [showSpinner, setShowSpinner] = useState(false);

    const [originalVideo, setOriginalVideo] = useState(null);

    const dispatch = useDispatch();

    const videoEventSource = useSelector(
        (state) => state.video.videoEventSource
    );
    const videoDetectedObjects = useSelector(
        (state) => state.video.videoDetectedObjects
    );
    const showReport = useSelector((state) => state.video.showReport);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const videoChangeHandler = useCallback((event) => {
        const file = event.target.files[0];
        setOriginalVideo(file);
    }, []);

    const getResultsHandler = useCallback(() => {
        dispatch(fetchVideoTrackInfo());
    }, [dispatch]);

    const videoSubmitHandler = useCallback(() => {
        setIsLoading(true);
        setShowSpinner(true);
        setIsPredicting(true);

        if (videoEventSource) {
            dispatch(resetVideoPrediction());
        }

        dispatch(processVideo(originalVideo))
            .then(() => new Promise((resolve) => setTimeout(resolve, 5000)))
            .then(() => dispatch(startVideoServerSentEventSource()))
            .then(() => {
                setShowSpinner(false);
            })
            .catch((error) => {
                console.log(error);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [dispatch, originalVideo, videoEventSource]);

    const videoResetHandler = useCallback(() => {
        dispatch(resetVideoPrediction());
        dispatch(resetVideoDetectedObjects());
        setOriginalVideo(null);
        setIsPredicting(false);
        setSseStarted(true);
        setIsLoading(false);
        setShowSpinner(false);

        if (videoRef.current) {
            videoRef.current.value = "";
        }
    }, [dispatch]);

    const downloadPdfHandler = async () => {
        setIsGeneratingPdf(true);
        try {
            const pdf = new jsPDF();

            pdf.setLineDash([]);
            pdf.line(10, 6, 200, 6);

            pdf.setFontSize(20);
            pdf.text("Video Prediction Report", 105, 15, {
                align: "center",
            });

            pdf.setLineDash([]);
            pdf.line(10, 19, 200, 19);

            pdf.setFontSize(16);

            const tableColumns = ["No.", "Objects", "Confidence"];
            const tableRows = videoDetectedObjects.map((object, index) => [
                index + 1,
                object.detected_class,
                `${object.detected_timestamps.toFixed(2)} `,
            ]);

            pdf.autoTable({
                head: [tableColumns],
                body: tableRows,
                startY: 25,
                theme: "grid",
                styles: {
                    cellPadding: 2,
                    fontSize: 11,
                    textColor: [0, 0, 0],
                    fontStyle: "normal",
                    valign: "middle",
                    halign: "center",
                },
                headStyles: {
                    fontSize: 13,
                    fillColor: [242, 242, 242],
                    textColor: [0, 0, 0],
                    valign: "middle",
                    halign: "center",
                },
                margin: { left: 20, right: 20 },
            });

            pdf.addPage();

            pdf.setFontSize(14);

            pdf.setLineDash([]);
            pdf.line(10, 278, 200, 278);

            pdf.setFontSize(20);
            pdf.setTextColor(0, 0, 0);
            pdf.text("© Secureye", 105, 287, {
                align: "center",
            });

            pdf.setLineDash([]);
            pdf.line(10, 292, 200, 292);

            pdf.save("video_prediction_report.pdf");
        } catch (error) {
            console.log(error);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const videoSrc = useMemo(
        () => (originalVideo ? URL.createObjectURL(originalVideo) : null),
        [originalVideo]
    );

    const loadingSpinner =
        isLoading || showSpinner ? (
            <CircularProgress
                size={60}
                color="inherit"
                sx={{ padding: "1.14rem" }}
            />
        ) : null;

    return (
        <>
            <div className={styles.videoContainer}>
                <Suspense fallback={<Loading />}>
                    <Navbar />
                </Suspense>

                <div className={styles.uploadButtonCard}>
                    <Button
                        variant="contained"
                        size="large"
                        component="label"
                        className={styles.uploadButton}
                        disabled={isPredicting || originalVideo}>
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
                    <div className={styles.videoCard}>
                        <div
                            className={styles.videoTemplate}
                            style={{
                                backgroundImage: originalVideo
                                    ? "none"
                                    : 'url("/static/defaultPlaceholder.jpg")',
                            }}>
                            {originalVideo && (
                                <video
                                    src={videoSrc}
                                    className={styles.renderedVideoFrame}
                                    controls
                                />
                            )}
                        </div>
                    </div>
                    <Suspense fallback={<Loading />}>
                        <VideoServerSentEvents />
                    </Suspense>
                </div>

                <div className={styles.predictionButtonsActions}>
                    <div className={styles.predictionButtonCard}>
                        {loadingSpinner || (
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
                            onClick={getResultsHandler}
                            disabled={!showReport}>
                            {"Report"}
                        </Button>
                    </div>

                    <div className={styles.predictionButtonCard}>
                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            className={styles.predictButton}
                            onClick={videoResetHandler}
                            disabled={sseStarted && !originalVideo}>
                            {"Reset"}
                        </Button>
                    </div>
                </div>

                <div className={styles.reportTableCard}>
                    <h1 className={styles.reportTableHeading}>
                        <span>{"Report"}</span>
                    </h1>

                    <table className={styles.reportTable}>
                        <thead>
                            <tr>
                                <th className={styles.reportHeading}>
                                    {"No."}
                                </th>
                                <th className={styles.reportHeading}>
                                    {"Objects"}
                                </th>
                                <th className={styles.reportHeading}>
                                    {"Timestamps"}
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {videoDetectedObjects.map((object, index) => (
                                <tr key={index + 1}>
                                    <td className={styles.tableCells}>
                                        {index + 1}
                                    </td>
                                    <td className={styles.tableCells}>
                                        {object.detected_class}
                                    </td>
                                    <td className={styles.tableCells}>
                                        {object.detected_timestamps.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {isGeneratingPdf ? (
                        <CircularProgress
                            size={47}
                            color="inherit"
                            sx={{ marginBottom: "2.2rem" }}
                        />
                    ) : (
                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            className={styles.reportDownloadButton}
                            disabled={!showReport}
                            onClick={downloadPdfHandler}>
                            {"Print"}
                        </Button>
                    )}
                </div>
            </div>
        </>
    );
}

export default Video;
