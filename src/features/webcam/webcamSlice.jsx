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
            return { ...state, webcamEventSource: action.payload };
        },
        setWebcamFrames: (state, action) => {
            return { ...state, webcamFrames: action.payload };
        },
        resetWebcamFrames: (state) => {
            return { ...state, webcamFrames: [] };
        },
        closeWebcamEventSource: (state) => {
            if (state.webcamEventSource) {
                state.webcamEventSource.close();
                return { ...state, webcamEventSource: null };
            }
            return state;
        },
        setWebcamError: (state, action) => {
            return { ...state, webcamError: action.payload };
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
