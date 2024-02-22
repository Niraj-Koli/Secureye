import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    accessToken: localStorage.getItem("access"),
    refreshToken: localStorage.getItem("refresh"),
    isAuthenticated: false,
    user: null,
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        authenticatedSuccess: (state) => {
            return { ...state, isAuthenticated: true };
        },
        authenticatedFail: (state) => {
            return { ...state, isAuthenticated: false };
        },
        loginSuccess: (state, action) => {
            const { access, refresh } = action.payload;

            localStorage.setItem("access", access);
            localStorage.setItem("refresh", refresh);
            return {
                ...state,
                isAuthenticated: true,
                accessToken: access,
                refreshToken: refresh,
            };
        },
        loginFail: (state) => {
            return { ...state, isAuthenticated: false };
        },
        signupSuccess: (state) => {
            return { ...state, isAuthenticated: false };
        },
        userLoadedSuccess: (state, action) => {
            return { ...state, user: action.payload };
        },
        userLoadedFail: (state) => {
            return { ...state, user: null };
        },
        logout: (state) => {
            localStorage.removeItem("access");
            localStorage.removeItem("refresh");
            return {
                ...state,
                accessToken: null,
                refreshToken: null,
                isAuthenticated: false,
                user: null,
            };
        },
    },
});

export const {
    authenticatedSuccess,
    authenticatedFail,
    loginSuccess,
    loginFail,
    signupSuccess,
    userLoadedSuccess,
    userLoadedFail,
    logout,
} = authSlice.actions;

export default authSlice.reducer;
