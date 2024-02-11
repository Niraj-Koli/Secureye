import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    csrfToken: null,
};

const cookieSlice = createSlice({
    name: "cookie",
    initialState,
    reducers: {
        setCsrfToken: (state, action) => {
            state.csrfToken = action.payload;
        },
    },
});

export const { setCsrfToken } = cookieSlice.actions;
export default cookieSlice.reducer;
