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
    TextField,
} from "@mui/material";

import styles from "./Reset.module.css";

import { requestPasswordReset } from "@/features/auth/authActions";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navbar = lazy(() => import("@/components/Elementals/Navbar/Navbar"));

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function Reset() {
    const [isLoading, setIsLoading] = useState(false);
    const [formState, setFormState] = useState({
        email: "",
    });
    const [dialogState, setDialogState] = useState({
        open: false,
        type: "success",
        message: "",
    });

    const { email } = formState;
    const { open, type, message } = dialogState;

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const inputChangeHandler = useCallback((event) => {
        setFormState((prevState) => ({
            ...prevState,
            [event.target.name]: event.target.value,
        }));
    }, []);

    const dialogCloseHandler = useCallback(() => {
        setDialogState((prevState) => ({
            ...prevState,
            open: false,
        }));
        if (type === "success") {
            navigate("/login");
        }
    }, [navigate, type]);

    const submitFormHandler = useCallback(
        (event) => {
            event.preventDefault();

            const isEmailValid = isValidEmail(email);

            if (isEmailValid) {
                setIsLoading(true);
                dispatch(requestPasswordReset(email))
                    .then(() => {
                        setDialogState({
                            open: true,
                            type: "success",
                            message:
                                "An email with instructions to reset your password has been sent. Please check your email.",
                        });
                    })
                    .catch((error) => {
                        console.log(error);
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
                    message: "Invalid email. Please try again.",
                });
            }
        },
        [dispatch, email]
    );

    return (
        <>
            <div className={styles.resetContainer}>
                <Suspense fallback={<Loading />}>
                    <Navbar />
                </Suspense>
                <div className={styles.resetCard}>
                    <h1 className={styles.resetHeading}>{"Reset Password"}</h1>

                    <form
                        className={styles.resetForm}
                        noValidate
                        onSubmit={submitFormHandler}>
                        <TextField
                            margin="normal"
                            inputProps={{ className: styles.resetInput }}
                            InputLabelProps={{ className: styles.resetLabels }}
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

                        <div className={styles.resetButtonContainer}>
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
                                    className={styles.resetButton}
                                    disabled={isLoading}>
                                    {"Send Reset Link"}
                                </Button>
                            )}
                        </div>

                        <div className={styles.anchorsContainer}>
                            <NavLink to="/login" className={styles.anchors}>
                                {"Remembered Password? Login"}
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
                    {type === "success"
                        ? "Reset Password Link Sent"
                        : "Reset Process Failed"}
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
                        {"Okay"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default Reset;
