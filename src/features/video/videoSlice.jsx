import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    videoDetectedObjects: [],
    eventSource: null,
    videoFrames: [],
};

const videoSlice = createSlice({
    name: "video",
    initialState,
    reducers: {
        setVideoDetectedObjects: (state, action) => {
            state.videoDetectedObjects = action.payload;
        },
        resetVideoPrediction: (state) => {
            state.videoDetectedObjects = [];
        },
        setEventSource: (state, action) => {
            state.eventSource = action.payload;
        },
        setVideoFrames: (state, action) => {
            state.videoFrames = action.payload;
        },
        resetVideoFrames: (state) => {
            state.videoFrames = [];
        },
        closeEventSource: (state) => {
            if (state.eventSource) {
                state.eventSource.close();
                state.eventSource = null;
            }
        },
    },
});

export const {
    setVideoDetectedObjects,
    resetVideoPrediction,
    setEventSource,
    setVideoFrames,
    resetVideoFrames,
    closeEventSource,
} = videoSlice.actions;
export default videoSlice.reducer;
