import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    videoDetectedObjects: [],
    videoEventSource: null,
    showReport: false,
    videoFrames: [],
};

const videoSlice = createSlice({
    name: "video",
    initialState,
    reducers: {
        setVideoDetectedObjects(state, action) {
            state.videoDetectedObjects = action.payload;
        },
        resetVideoDetectedObjects(state) {
            state.videoDetectedObjects = [];
        },
        setVideoEventSource(state, action) {
            state.videoEventSource = action.payload;
        },
        setShowReport(state) {
            state.showReport = true
        },
        setVideoFrames(state, action) {
            state.videoFrames = action.payload;
        },
        resetVideoPrediction(state) {
            state.videoFrames = [];
            state.showReport = false;

            if (state.videoEventSource) {
                state.videoEventSource.close();
                state.videoEventSource = null;
            }
        },
    },
});

export const {
    setVideoDetectedObjects,
    setVideoEventSource,
    setVideoFrames,
    setShowReport,
    resetVideoDetectedObjects,
    resetVideoPrediction,
} = videoSlice.actions;
export default videoSlice.reducer;
