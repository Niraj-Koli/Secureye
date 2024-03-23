import { createAsyncThunk } from "@reduxjs/toolkit";

import {
    setWebcamDetectedObjects,
    setWebcamEventSource,
    setWebcamFrames,
    setWebcamError,
    resetWebcamPrediction,
} from "@/features/webcam/webcamSlice";

const API_BASE_URL = import.meta.env.VITE_REACT_APP_API_URL;

export const startWebcamServerSentEventSource = createAsyncThunk(
    "webcam/startWebcamServerSentEventSource",
    async (_, { dispatch }) => {
        dispatch(resetWebcamPrediction());
        const eventSource = new EventSource(
            `${API_BASE_URL}/prediction/webcamFrames/`
        );

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            const webcamFrame = data.webcam_frame;
            const detectedWebcamObject = data.detected_object;

            const detectedWebcamElement = detectedWebcamObject
                ? detectedWebcamObject.detected_element
                : null;

            if (detectedWebcamElement !== null) {
                dispatch(setWebcamDetectedObjects(detectedWebcamObject));
            }

            dispatch(setWebcamFrames([webcamFrame]));
        };

        eventSource.onerror = (error) => {
            dispatch(setWebcamError(true));
            console.log("Event source error:", error);
        };

        dispatch(setWebcamEventSource(eventSource));
    }
);
