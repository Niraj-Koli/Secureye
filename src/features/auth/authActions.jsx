import axios from "axios";

import { createAsyncThunk } from "@reduxjs/toolkit";

import { loginSuccess } from "@/features/auth/authSlice";

const API_BASE_URL = import.meta.env.VITE_REACT_APP_API_URL;

const authAPI = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

export const fetchUser = createAsyncThunk("auth/fetchUser", async () => {
    const accessToken = localStorage.getItem("access");

    if (accessToken) {
        const config = {
            headers: {
                Authorization: `JWT ${accessToken}`,
                Accept: "application/json",
            },
        };

        const response = await authAPI.get("/auth/users/me/", config);
        return response.data;
    } else {
        throw new Error("Access Token Not Found");
    }
});

export const verifyAuthentication = createAsyncThunk(
    "auth/verifyAuthentication",
    async () => {
        const accessToken = localStorage.getItem("access");

        if (accessToken) {
            const config = {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            };

            const body = JSON.stringify({
                token: accessToken,
            });

            const response = await authAPI.post(
                "/auth/jwt/verify/",
                body,
                config
            );
            return response.data.code !== "token_not_valid";
        } else {
            throw new Error("Access Token Not Found");
        }
    }
);

export const loginUserRequest = createAsyncThunk(
    "auth/loginUserRequest",
    async ({ email, password }, { dispatch }) => {
        const body = JSON.stringify({ email, password });

        const response = await authAPI.post("/auth/jwt/create/", body);

        dispatch(loginSuccess(response.data));
        dispatch(fetchUser());
        return response.data;
    }
);

export const signupUserRequest = createAsyncThunk(
    "auth/signupUserRequest",
    async ({ email, name, password }) => {
        const body = JSON.stringify({
            email,
            name,
            password,
        });

        const response = await authAPI.post("/auth/users/", body);
        return response.data;
    }
);

export const activateUserAccount = createAsyncThunk(
    "auth/activateUserAccount",
    async ({ uid, token }) => {
        const body = JSON.stringify({ uid, token });

        const response = await authAPI.post("/auth/users/activation/", body);
        return response.data;
    }
);

export const requestPasswordReset = createAsyncThunk(
    "auth/requestPasswordReset",
    async (email) => {
        const body = JSON.stringify({ email });

        const response = await authAPI.post(
            "/auth/users/reset_password/",
            body
        );
        return response.data;
    }
);

export const confirmPasswordReset = createAsyncThunk(
    "auth/confirmPasswordReset",
    async ({ uid, token, new_password, re_new_password }) => {
        const body = JSON.stringify({
            uid,
            token,
            new_password,
            re_new_password,
        });

        const response = await authAPI.post(
            "/auth/users/reset_password_confirm/",
            body
        );
        return response.data;
    }
);
