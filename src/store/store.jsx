import { combineReducers, configureStore } from "@reduxjs/toolkit";

import authReducer from "@/features/auth/authSlice";
import imageReducer from "@/features/image/imageSlice";
import cookieReducer from "@/features/cookie/cookieSlice";
import videoReducer from "@/features/video/videoSlice";
import webcamReducer from "@/features/webcam/webcamSlice";

const rootReducer = combineReducers({
    auth: authReducer,
    image: imageReducer,
    cookie: cookieReducer,
    video: videoReducer,
    webcam: webcamReducer,
});

const store = configureStore({
    reducer: rootReducer,
    devTools: import.meta.env.MODE === "development",
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }),
});

export default store;
