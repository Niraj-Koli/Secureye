import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    csrfToken: null,
};

const csrfSlice = createSlice({
    name: "csrf",
    initialState,
    reducers: {
        setCsrfToken: (state, action) => {
            state.csrfToken = action.payload;
        },
    },
});

export const { setCsrfToken } = csrfSlice.actions;
export default csrfSlice.reducer;
