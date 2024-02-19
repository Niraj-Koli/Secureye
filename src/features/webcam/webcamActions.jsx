import { createAsyncThunk } from "@reduxjs/toolkit";

import {
    setWebcamEventSource,
    setWebcamFrames,
    resetWebcamFrames,
    closeWebcamEventSource,
    setWebcamError,
} from "@/features/webcam/webcamSlice";

const API_BASE_URL = import.meta.env.VITE_REACT_APP_API_URL;

export const startWebcamServerSentEventSource = createAsyncThunk(
    "webcam/startWebcamServerSentEventSource",
    async (_, { dispatch }) => {
        const eventSource = new EventSource(
            `${API_BASE_URL}/prediction/webcamFrames/`
        );

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const imageFrame = data.image;

            dispatch(setWebcamFrames([imageFrame]));
        };

        eventSource.onerror = (error) => {
            dispatch(setWebcamError(true));
            console.log("Event source error:", error);
        };

        dispatch(setWebcamEventSource(eventSource));
    }
);

export const closeWebcamServerSendEventSource = createAsyncThunk(
    "webcam/closeWebcamServerSendEventSource",
    async (_, { dispatch }) => {
        dispatch(resetWebcamFrames());
        dispatch(closeWebcamEventSource());
    }
);
