import jsPDF from "jspdf";
import "jspdf-autotable";
import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, CircularProgress } from "@mui/material";

import styles from "./Image.module.css";

import { resetImagePrediction } from "@/features/image/imageSlice";

import { processImage } from "@/features/image/imageActions";

import Navbar from "@/components/Elementals/Navbar/Navbar";

function Image() {
    const imageRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isPredicting, setIsPredicting] = useState(false);
    const [originalImage, setOriginalImage] = useState(null);
    const [allowPrintPdf, setAllowPrintPdf] = useState(false);

    const dispatch = useDispatch();

    const predictedImage = useSelector((state) => state.image.predictedImage);
    const imageDetectedObjects = useSelector(
        (state) => state.image.imageDetectedObjects
    );

    const imageChangeHandler = (event) => {
        const file = event.target.files[0];
        setOriginalImage(file);
    };

    const imageSubmitHandler = async () => {
        setIsLoading(true);
        setIsPredicting(true);

        try {
            await dispatch(processImage(originalImage));

            setAllowPrintPdf(true);
        } catch (error) {
            console.log(error);
        } finally {
            setIsLoading(false);
        }
    };

    const removeImagesHandler = () => {
        dispatch(resetImagePrediction());
        setOriginalImage(null);
        setIsPredicting(false);
        setAllowPrintPdf(false);

        if (imageRef.current) {
            imageRef.current.value = "";
        }
    };

    const downloadPdfHandler = async () => {
        try {
            const pdf = new jsPDF();
            const imgHeight = 110;
            const imgWidth = 165;

            const originalImageData = URL.createObjectURL(originalImage);

            const predictedImageBlob = await fetch(predictedImage).then((res) =>
                res.blob()
            );

            const predictedImageData = URL.createObjectURL(predictedImageBlob);

            pdf.setLineDash([]);
            pdf.line(10, 6, 200, 6);

            pdf.setFontSize(22);
            pdf.text("Prediction Report", 105, 15, {
                align: "center",
            });

            pdf.setLineDash([]);
            pdf.line(10, 19, 200, 19);

            pdf.setFontSize(18);
            pdf.text("Original Image", 105, 27, { align: "center" });
            pdf.addImage(
                originalImageData,
                "JPEG",
                105 - imgWidth / 2,
                32,
                imgWidth,
                imgHeight
            );

            pdf.setLineDash([]);
            pdf.line(10, 148, 200, 148);

            pdf.text("Predicted Image", 105, 157, { align: "center" });
            pdf.addImage(
                predictedImageData,
                "JPEG",
                105 - imgWidth / 2,
                162,
                imgWidth,
                imgHeight
            );

            pdf.setLineDash([]);
            pdf.line(10, 278, 200, 278);

            pdf.addPage();

            pdf.setLineDash([]);
            pdf.line(10, 7, 200, 7);

            pdf.setFontSize(22);
            pdf.text("Prediction Analysis", 105, 16, {
                align: "center",
            });

            pdf.setLineDash([]);
            pdf.line(10, 20, 200, 20);

            pdf.setFontSize(18);

            const tableColumns = ["No.", "Objects", "Confidence"];
            const tableRows = imageDetectedObjects.map((object, index) => [
                index + 1,
                object.class,
                `${object.confidence} %`,
            ]);

            pdf.autoTable({
                head: [tableColumns],
                body: tableRows,
                startY: 28,
                theme: "grid",
                styles: {
                    cellPadding: 2,
                    fontSize: 13,
                    textColor: [0, 0, 0],
                    fontStyle: "normal",
                    valign: "middle",
                    halign: "center",
                },
                headStyles: {
                    fontSize: 15,
                    fillColor: [242, 242, 242],
                    textColor: [0, 0, 0],
                    valign: "middle",
                    halign: "center",
                },
                margin: { left: 20, right: 20 },
            });

            pdf.setFontSize(16);

            pdf.setLineDash([]);
            pdf.line(10, 278, 200, 278);

            pdf.setFontSize(20);
            pdf.setTextColor(0, 0, 0);
            pdf.text("© Guardinger Technologies", 105, 287, {
                align: "center",
            });

            pdf.setLineDash([]);
            pdf.line(10, 292, 200, 292);

            pdf.save("image_prediction_report.pdf");
        } catch (error) {
            console.log(error);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <>
            <div className={styles.imageContainer}>
                <Navbar />

                <div className={styles.uploadButtonCard}>
                    <Button
                        variant="contained"
                        size="large"
                        component="label"
                        className={styles.uploadButton}
                        disabled={isPredicting || originalImage}>
                        {"Image"}
                        <input
                            type="file"
                            ref={imageRef}
                            onChange={imageChangeHandler}
                            hidden
                            accept="image/*"
                        />
                    </Button>
                </div>

                <div className={styles.predictionCards}>
                    <div className={styles.imageCard}>
                        <div className={styles.imageTemplate}>
                            {originalImage && (
                                <img
                                    src={URL.createObjectURL(originalImage)}
                                    alt="Input Image"
                                    className={styles.renderedImage}
                                />
                            )}
                        </div>
                    </div>
                    <div className={styles.imageCard}>
                        <div className={styles.imageTemplate}>
                            {predictedImage && (
                                <img
                                    src={predictedImage}
                                    alt="Predicted Image"
                                    className={styles.renderedImage}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.predictionButtonsActions}>
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
                                onClick={imageSubmitHandler}
                                disabled={!originalImage || isLoading}>
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
                            onClick={removeImagesHandler}
                            disabled={!originalImage}>
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
                                    {"Confidence"}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {imageDetectedObjects.map((object, index) => (
                                <tr key={index + 1}>
                                    <td className={styles.tableCells}>
                                        {index + 1}
                                    </td>
                                    <td className={styles.tableCells}>
                                        {object.class}
                                    </td>
                                    <td className={styles.tableCells}>
                                        {object.confidence} {"%"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
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
        </>
    );
}

export default Image;
