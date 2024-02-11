import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import { setCsrfToken } from "@/features/cookie/cookieSlice";
import {
    setPredictedImage,
    setRetainedArea,
    setDestroyedArea,
} from "@/features/prediction/predictionSlice";

const API_BASE_URL = import.meta.env.VITE_REACT_APP_API_URL;

export const processImage = createAsyncThunk(
    "prediction/processImage",
    async (formState, { dispatch }) => {
        const config = {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        };

        try {
            const response = await axios.post(
                `${API_BASE_URL}/prediction/image/`,
                formState,
                config
            );

            if (response.status === 200) {
                const data = response.data;

                const newCsrfToken = response.headers["x-csrftoken"];
                dispatch(setCsrfToken(newCsrfToken));

                const image = data.image;

                dispatch(setPredictedImage(`data:image/jpeg;base64,${image}`));
                dispatch(setRetainedArea(data.retainedArea));
                dispatch(setDestroyedArea(data.destroyedArea));

                return data;
            } else {
                throw new Error("Failed To Upload Image");
            }
        } catch (error) {
            console.log(error);
            throw new Error("Error Uploading Image");
        }
    }
);
