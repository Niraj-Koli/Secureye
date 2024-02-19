import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    webcamEventSource: null,
    webcamFrames: [],
    webcamError: false,
};

const webcamSlice = createSlice({
    name: "webcam",
    initialState,
    reducers: {
        setWebcamEventSource: (state, action) => {
            state.webcamEventSource = action.payload;
        },
        setWebcamFrames: (state, action) => {
            state.webcamFrames = action.payload;
        },
        resetWebcamFrames: (state) => {
            state.webcamFrames = [];
        },
        closeWebcamEventSource: (state) => {
            if (state.webcamEventSource) {
                state.webcamEventSource.close();
                state.webcamEventSource = null;
            }
        },
        setWebcamError: (state, action) => {
            state.webcamError = action.payload;
        },
    },
});

export const {
    setWebcamEventSource,
    setWebcamFrames,
    resetWebcamFrames,
    closeWebcamEventSource,
    setWebcamError,
} = webcamSlice.actions;
export default webcamSlice.reducer;
