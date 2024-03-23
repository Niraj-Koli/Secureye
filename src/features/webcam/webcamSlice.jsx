import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    webcamDetectedObjects: [],
    webcamEventSource: null,
    webcamFrames: [],
    webcamError: false,
};

const webcamSlice = createSlice({
    name: "webcam",
    initialState,
    reducers: {
        setWebcamDetectedObjects(state, action) {
            state.webcamDetectedObjects.push(action.payload);
        },
        resetWebcamDetectedObjects(state) {
            state.webcamDetectedObjects = [];
        },
        setWebcamEventSource(state, action) {
            state.webcamEventSource = action.payload;
        },
        setWebcamFrames(state, action) {
            state.webcamFrames = action.payload;
        },
        setWebcamError(state, action) {
            state.webcamError = action.payload;
        },
        resetWebcamPrediction(state) {
            state.webcamFrames = [];

            if (state.webcamEventSource) {
                state.webcamEventSource.close();
                state.webcamEventSource = null;
            }
        },
    },
});

export const {
    setWebcamDetectedObjects,
    resetWebcamDetectedObjects,
    setWebcamEventSource,
    setWebcamFrames,
    setWebcamError,
    resetWebcamPrediction,
} = webcamSlice.actions;
export default webcamSlice.reducer;
