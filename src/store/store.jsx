import { combineReducers, configureStore } from "@reduxjs/toolkit";

import authReducer from "@/features/auth/authSlice";
import imageReducer from "@/features/image/imageSlice";
import cookieReducer from "@/features/cookie/cookieSlice";

const rootReducer = combineReducers({
    auth: authReducer,
    image: imageReducer,
    cookie: cookieReducer,
});

const store = configureStore({
    reducer: rootReducer,
    devTools: import.meta.env.MODE === "development",
});

export default store;
