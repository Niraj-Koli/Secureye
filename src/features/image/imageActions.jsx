import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

import { setCsrfToken } from "@/features/cookie/cookieSlice";
import {
    setPredictedImage,
    setImageDetectionObjects,
} from "@/features/image/imageSlice";

const API_BASE_URL = import.meta.env.VITE_REACT_APP_API_URL;

export const processImage = createAsyncThunk(
    "image/processImage",
    async (image, { dispatch }) => {
        const formData = new FormData();
        formData.append("image", image);

        const config = {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        };

        try {
            const response = await axios.post(
                `${API_BASE_URL}/prediction/image/`,
                formData,
                config
            );

            if (response.status === 200) {
                const data = response.data;

                const newCsrfToken = response.headers["x-csrftoken"];
                dispatch(setCsrfToken(newCsrfToken));

                const image = data.image;

                dispatch(setPredictedImage(`data:image/jpeg;base64,${image}`));
                dispatch(setImageDetectionObjects(data.objects));

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
