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
            return { ...state, predictedImage: action.payload };
        },
        setImageDetectedObjects: (state, action) => {
            return { ...state, imageDetectedObjects: action.payload };
        },
        resetImagePrediction: (state) => {
            return { ...state, predictedImage: null, imageDetectedObjects: [] };
        },
    },
});

export const {
    setPredictedImage,
    setImageDetectedObjects,
    resetImagePrediction,
} = imageSlice.actions;
export default imageSlice.reducer;
