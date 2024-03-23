import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import { setCsrfToken } from "@/features/csrf/csrfSlice";
import {
    setVideoDetectedObjects,
    setVideoEventSource,
    setVideoFrames,
    setShowReport,
    resetVideoPrediction,
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
        }
    }
);

export const fetchVideoTrackInfo = createAsyncThunk(
    "video/fetchVideoTrackInfo",
    async (_, { dispatch }) => {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/prediction/fetchData/`
            );

            if (response.status === 200) {
                const data = response.data;

                const detectedVideoObjects = data.video_detected_objects;

                dispatch(setVideoDetectedObjects(detectedVideoObjects));

                return data;
            } else {
                throw new Error("Failed To Upload Video");
            }
        } catch (error) {
            console.log(error);
        }
    }
);

export const startVideoServerSentEventSource = createAsyncThunk(
    "video/startVideoServerSentEventSource",
    async (_, { dispatch }) => {
        dispatch(resetVideoPrediction());
        const eventSource = new EventSource(
            `${API_BASE_URL}/prediction/videoFrames/`
        );

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            const videoFrame = data.video_frame;

            dispatch(setVideoFrames([videoFrame]));
        };

        eventSource.onerror = (error) => {
            dispatch(setShowReport());
            console.log("Event source error:", error);
            eventSource.close();
        };

        dispatch(setVideoEventSource(eventSource));
    }
);
