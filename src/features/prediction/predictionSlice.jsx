import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    predictedImage: null,
    detectedObjects: [],
};

const predictionSlice = createSlice({
    name: "prediction",
    initialState,
    reducers: {
        setPredictedImage: (state, action) => {
            state.predictedImage = action.payload;
        },
        setDetectedObjects: (state, action) => {
            state.detectedObjects = action.payload;
        },
        resetPrediction: (state) => {
            state.predictedImage = null;
            state.detectedObjects = [];
        },
    },
});

export const { setPredictedImage, setDetectedObjects, resetPrediction } =
    predictionSlice.actions;
export default predictionSlice.reducer;
