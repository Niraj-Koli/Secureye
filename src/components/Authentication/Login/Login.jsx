import { Suspense, lazy, useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";

import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    TextField,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";

import styles from "./Login.module.css";

import { loginUserRequest } from "@/features/auth/authActions";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navbar = lazy(() => import("@/components/Elementals/Navbar/Navbar"));

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPassword = (value) => value.trim().length > 7 && !/\s/.test(value);

function Login() {
    const [isLoading, setIsLoading] = useState(false);
    const [formState, setFormState] = useState({
        email: "",
        password: "",
        isShowNewPassword: false,
    });
    const [dialogState, setDialogState] = useState({
        open: false,
        type: "success",
        message: "",
    });

    const { email, password, isShowNewPassword } = formState;
    const { open, type, message } = dialogState;

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const inputChangeHandler = useCallback((event) => {
        setFormState((prevState) => ({
            ...prevState,
            [event.target.name]: event.target.value,
        }));
    }, []);

    const toggleShowPassword = useCallback(() => {
        setFormState((prevState) => ({
            ...prevState,
            isShowNewPassword: !prevState.isShowNewPassword,
        }));
    }, []);

    const dialogCloseHandler = useCallback(() => {
        setDialogState((prevState) => ({
            ...prevState,
            open: false,
        }));
        if (type === "success") {
            navigate("/");
        }
    }, [navigate, type]);

    const submitFormHandler = useCallback(
        (event) => {
            event.preventDefault();

            const isEmailValid = isValidEmail(email);
            const isPasswordValid = isValidPassword(password);

            if (isEmailValid && isPasswordValid) {
                setIsLoading(true);
                dispatch(loginUserRequest({ email, password }))
                    .then((action) => {
                        const response = action.payload;

                        if (response) {
                            setDialogState({
                                open: true,
                                type: "success",
                                message:
                                    "Welcome! You have successfully logged in.",
                            });
                        } else {
                            setDialogState({
                                open: true,
                                type: "error",
                                message:
                                    "Invalid email or password. Please try again.",
                            });
                        }
                    })
                    .catch((error) => {
                        console.error(error);
                        setDialogState({
                            open: true,
                            type: "error",
                            message: "An error occurred. Please try again.",
                        });
                    })
                    .finally(() => {
                        setIsLoading(false);
                    });
            } else {
                setDialogState({
                    open: true,
                    type: "error",
                    message: "Invalid email or password. Please try again.",
                });
            }
        },
        [dispatch, email, password]
    );

    return (
        <>
            <div className={styles.loginContainer}>
                <Suspense fallback={<Loading />}>
                    <Navbar />
                </Suspense>
                <div className={styles.loginCard}>
                    <h1 className={styles.loginHeading}>{"Login"}</h1>

                    <form
                        className={styles.loginForm}
                        noValidate
                        onSubmit={submitFormHandler}>
                        <TextField
                            margin="normal"
                            inputProps={{ className: styles.loginInput }}
                            InputLabelProps={{ className: styles.loginLabels }}
                            color="black"
                            required
                            fullWidth
                            label="Email Address"
                            name="email"
                            id="email"
                            type="email"
                            value={email}
                            onChange={inputChangeHandler}
                        />

                        <TextField
                            margin="normal"
                            inputProps={{ className: styles.loginInput }}
                            InputLabelProps={{ className: styles.loginLabels }}
                            color="black"
                            required
                            fullWidth
                            label="Password"
                            name="password"
                            id="password"
                            type={isShowNewPassword ? "text" : "password"}
                            value={password}
                            onChange={inputChangeHandler}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={toggleShowPassword}
                                            edge="end">
                                            {isShowNewPassword ? (
                                                <VisibilityOff
                                                    className={
                                                        styles.showPasswordIcon
                                                    }
                                                />
                                            ) : (
                                                <Visibility
                                                    className={
                                                        styles.showPasswordIcon
                                                    }
                                                />
                                            )}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <div className={styles.loginButtonContainer}>
                            {isLoading ? (
                                <CircularProgress
                                    size={52}
                                    color="inherit"
                                    sx={{ margin: "1rem" }}
                                />
                            ) : (
                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    className={styles.loginButton}
                                    disabled={isLoading}>
                                    {"Login"}
                                </Button>
                            )}
                        </div>

                        <div className={styles.anchorsContainer}>
                            <NavLink
                                to="/reset-password"
                                className={styles.anchors}>
                                {"Forgot password?"}
                            </NavLink>
                            <NavLink to="/signup" className={styles.anchors}>
                                {"Don't have an account? Signup"}
                            </NavLink>
                        </div>
                    </form>
                </div>
            </div>

            <Dialog
                fullWidth
                maxWidth="sm"
                open={open}
                onClose={dialogCloseHandler}
                classes={{
                    paper:
                        type === "success"
                            ? styles.successModal
                            : styles.errorModal,
                }}>
                <DialogTitle
                    className={
                        type === "success"
                            ? styles.successTitle
                            : styles.errorTitle
                    }>
                    {type === "success" ? "Login Successful" : "Login Failed"}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText
                        className={
                            type === "success"
                                ? styles.successMessage
                                : styles.errorMessage
                        }>
                        {message}
                    </DialogContentText>
                </DialogContent>
                <DialogActions
                    className={
                        type === "success"
                            ? styles.successAction
                            : styles.errorAction
                    }>
                    <Button
                        fullWidth
                        size="large"
                        onClick={dialogCloseHandler}
                        className={
                            type === "success"
                                ? styles.successButton
                                : styles.errorButton
                        }
                        autoFocus>
                        {type === "success" ? "Explore" : "Okay"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default Login;
