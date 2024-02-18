import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    predictedImage: null,
    imageDetectedObjects: [],
};

const imageSlice = createSlice({
    name: "image",
    initialState,
    reducers: {
        setPredictedImage: (state, action) => {
            state.predictedImage = action.payload;
        },
        setImageDetectionObjects: (state, action) => {
            state.imageDetectedObjects = action.payload;
        },
        resetImagePrediction: (state) => {
            state.predictedImage = null;
            state.imageDetectedObjects = [];
        },
    },
});

export const {
    setPredictedImage,
    setImageDetectionObjects,
    resetImagePrediction,
} = imageSlice.actions;
export default imageSlice.reducer;
