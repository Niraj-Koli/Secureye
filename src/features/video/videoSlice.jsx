import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    videoDetectedObjects: [],
    videoEventSource: null,
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
        setVideoEventSource: (state, action) => {
            state.videoEventSource = action.payload;
        },
        setVideoFrames: (state, action) => {
            state.videoFrames = action.payload;
        },
        resetVideoFrames: (state) => {
            state.videoFrames = [];
        },
        closeVideoEventSource: (state) => {
            if (state.videoEventSource) {
                state.videoEventSource.close();
                state.videoEventSource = null;
            }
        },
    },
});

export const {
    setVideoDetectedObjects,
    resetVideoPrediction,
    setVideoEventSource,
    setVideoFrames,
    resetVideoFrames,
    closeVideoEventSource,
} = videoSlice.actions;
export default videoSlice.reducer;
