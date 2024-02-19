import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import { setCsrfToken } from "@/features/cookie/cookieSlice";
import {
    setVideoEventSource,
    setVideoFrames,
    resetVideoFrames,
    closeVideoEventSource,
} from "@/features/video/videoSlice";

const API_BASE_URL = import.meta.env.VITE_REACT_APP_API_URL;

export const processVideo = createAsyncThunk(
    "video/processVideo",
    async (video, { dispatch }) => {
        const formData = new FormData();
        formData.append("video", video);

        const config = {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        };

        try {
            const response = await axios.post(
                `${API_BASE_URL}/prediction/video/`,
                formData,
                config
            );

            if (response.status === 200) {
                const data = response.data;

                const newCsrfToken = response.headers["x-csrftoken"];
                dispatch(setCsrfToken(newCsrfToken));

                return data;
            } else {
                throw new Error("Failed To Upload Video");
            }
        } catch (error) {
            console.log(error);
            throw new Error("Error Uploading Video");
        }
    }
);

export const startVideoServerSentEventSource = createAsyncThunk(
    "video/startVideoServerSentEventSource",
    async (_, { dispatch }) => {
        const eventSource = new EventSource(
            `${API_BASE_URL}/prediction/videoFrames/`
        );

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const imageFrame = data.image;

            dispatch(setVideoFrames([imageFrame]));
        };

        eventSource.onerror = (error) => {
            console.log("Event source error:", error);
        };

        dispatch(setVideoEventSource(eventSource));
    }
);

export const closeVideoServerSendEventSource = createAsyncThunk(
    "video/closeVideoServerSendEventSource",
    async (_, { dispatch }) => {
        dispatch(resetVideoFrames());
        dispatch(closeVideoEventSource());
    }
);
