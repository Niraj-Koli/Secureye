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
            return { ...state, videoDetectedObjects: action.payload };
        },
        resetVideoDetectedObjects: (state) => {
            return { ...state, videoDetectedObjects: [] };
        },
        setVideoEventSource: (state, action) => {
            return { ...state, videoEventSource: action.payload };
        },
        setVideoFrames: (state, action) => {
            return { ...state, videoFrames: action.payload };
        },
        resetVideoFrames: (state) => {
            return { ...state, videoFrames: [] };
        },
        closeVideoEventSource: (state) => {
            if (state.videoEventSource) {
                state.videoEventSource.close();
                return { ...state, videoEventSource: null };
            }
            return state;
        },
    },
});

export const {
    setVideoDetectedObjects,
    resetVideoDetectedObjects,
    setVideoEventSource,
    setVideoFrames,
    resetVideoFrames,
    closeVideoEventSource,
} = videoSlice.actions;
export default videoSlice.reducer;
