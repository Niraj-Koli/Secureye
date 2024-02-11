import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    predictedImage: null,
    retainedArea: 0,
    destroyedArea: 0,
};

const predictionSlice = createSlice({
    name: "prediction",
    initialState,
    reducers: {
        setPredictedImage: (state, action) => {
            state.predictedImage = action.payload;
        },
        setRetainedArea: (state, action) => {
            state.retainedArea = action.payload;
        },
        setDestroyedArea: (state, action) => {
            state.destroyedArea = action.payload;
        },
        resetPrediction: (state) => {
            state.predictedImage = null;
            state.retainedArea = 0;
            state.destroyedArea = 0;
        },
    },
});

export const {
    setPredictedImage,
    setRetainedArea,
    setDestroyedArea,
    resetPrediction,
} = predictionSlice.actions;
export default predictionSlice.reducer;
