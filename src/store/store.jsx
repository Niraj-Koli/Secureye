import { combineReducers, configureStore } from "@reduxjs/toolkit";

import authReducer from "@/features/auth/authSlice";
import predictionReducer from "@/features/prediction/predictionSlice";
import cookieReducer from "@/features/cookie/cookieSlice";

const rootReducer = combineReducers({
    auth: authReducer,
    prediction: predictionReducer,
    cookie: cookieReducer,
});

const store = configureStore({
    reducer: rootReducer,
    devTools: import.meta.env.MODE === "development",
});

export default store;
