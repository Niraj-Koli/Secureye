import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import {
    StyledEngineProvider,
    ThemeProvider,
    createTheme,
} from "@mui/material";

import "./index.css";

import App from "./App";

import store from "./store/store";

const theme = createTheme({
    typography: {
        fontFamily: "Montserrat",
    },
    palette: {
        white: {
            main: "#ffffff",
        },
        black: {
            main: "#000000",
        },
    },
});

ReactDOM.createRoot(document.getElementById("root")).render(
    <>
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <Provider store={store}>
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </Provider>
            </ThemeProvider>
        </StyledEngineProvider>
    </>
);
