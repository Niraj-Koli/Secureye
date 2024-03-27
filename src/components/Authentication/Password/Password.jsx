import { Suspense, lazy, useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

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

import styles from "./Password.module.css";

import { confirmPasswordReset } from "@/features/auth/authActions";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navigation = lazy(() =>
    import("@/components/Elementals/Navigation/Navigation")
);

const isValidPasswordLength = (value) =>
    value.trim().length > 7 && !/\s/.test(value);
const arePasswordsEqual = (password1, password2) => password1 === password2;

function Password() {
    const { uid, token } = useParams();

    const [isLoading, setIsLoading] = useState(false);
    const [formState, setFormState] = useState({
        newPassword: "",
        confirmPassword: "",
        isShowNewPassword: false,
        isShowConfirmPassword: false,
    });
    const [dialogState, setDialogState] = useState({
        open: false,
        type: "success",
        message: "",
    });

    const {
        newPassword,
        confirmPassword,
        isShowNewPassword,
        isShowConfirmPassword,
    } = formState;
    const { open, type, message } = dialogState;

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const inputChangeHandler = useCallback((event) => {
        setFormState((prevState) => ({
            ...prevState,
            [event.target.name]: event.target.value,
        }));
    }, []);

    const toggleShowPassword = useCallback((passwordType) => {
        setFormState((prevState) => ({
            ...prevState,
            [passwordType]: !prevState[passwordType],
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

            const isPassword1Valid = isValidPasswordLength(newPassword);
            const isPassword2Valid = isValidPasswordLength(confirmPassword);
            const arePasswordsEquals = arePasswordsEqual(
                newPassword,
                confirmPassword
            );

            if (isPassword1Valid && isPassword2Valid && arePasswordsEquals) {
                setIsLoading(true);
                dispatch(
                    confirmPasswordReset({
                        uid,
                        token,
                        new_password: newPassword,
                        re_new_password: confirmPassword,
                    })
                )
                    .then(() => {
                        setDialogState({
                            open: true,
                            type: "success",
                            message:
                                "Password changed successfully, You can login now.",
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
                    message: "Passwords does not match. Please try again.",
                });
            }
        },
        [dispatch, newPassword, confirmPassword, uid, token]
    );

    return (
        <>
            <div className={styles.passwordContainer}>
                <Suspense fallback={<Loading />}>
                    <Navigation />
                </Suspense>
                <div className={styles.passwordCard}>
                    <h1 className={styles.passwordHeading}>
                        {"Change Password"}
                    </h1>

                    <form
                        className={styles.passwordForm}
                        noValidate
                        onSubmit={submitFormHandler}>
                        <TextField
                            margin="normal"
                            inputProps={{ className: styles.passwordInput }}
                            InputLabelProps={{
                                className: styles.passwordLabels,
                            }}
                            color="black"
                            required
                            fullWidth
                            label="New Password"
                            name="newPassword"
                            id="newpassword"
                            type={isShowNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={inputChangeHandler}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() =>
                                                toggleShowPassword(
                                                    "isShowNewPassword"
                                                )
                                            }
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

                        <TextField
                            margin="normal"
                            inputProps={{ className: styles.passwordInput }}
                            InputLabelProps={{
                                className: styles.passwordLabels,
                            }}
                            color="black"
                            required
                            fullWidth
                            label="Confirm Password"
                            name="confirmPassword"
                            id="confirmpassword"
                            type={isShowConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={inputChangeHandler}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() =>
                                                toggleShowPassword(
                                                    "isShowConfirmPassword"
                                                )
                                            }
                                            edge="end">
                                            {isShowConfirmPassword ? (
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

                        <div className={styles.passwordButtonContainer}>
                            {isLoading ? (
                                <CircularProgress
                                    size={37}
                                    color="inherit"
                                    sx={{ margin: "1rem" }}
                                />
                            ) : (
                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    className={styles.passwordButton}
                                    disabled={isLoading}>
                                    {"Change"}
                                </Button>
                            )}
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
                        ? "Password Changed!"
                        : "Password Change Process Failed"}
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
                        {type === "success" ? "Login" : "Okay"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default Password;
