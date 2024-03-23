import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    predictedImage: null,
    imageDetectedObjects: [],
};

const imageSlice = createSlice({
    name: "image",
    initialState,
    reducers: {
        setPredictedImage(state, action) {
            state.predictedImage = action.payload;
        },
        setImageDetectedObjects(state, action) {
            state.imageDetectedObjects = action.payload;
        },
        resetImagePrediction(state) {
            state.predictedImage = null;
            state.imageDetectedObjects = [];
        },
    },
});

export const {
    setPredictedImage,
    setImageDetectedObjects,
    resetImagePrediction,
} = imageSlice.actions;
export default imageSlice.reducer;
