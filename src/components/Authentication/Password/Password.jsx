import { useState } from "react";
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

import Navbar from "@/components/Elementals/Navbar/Navbar";

const isValidPasswordLength = (value) =>
    value.trim().length > 7 && !/\s/.test(value);
const arePasswordsEqual = (password1, password2) => password1 === password2;

function Password() {
    const { uid, token } = useParams();

    const [formState, setFormState] = useState({
        newPassword: "",
        confirmPassword: "",
        isShowNewPassword: false,
        isShowConfirmPassword: false,
    });

    const [isLoading, setIsLoading] = useState(false);
    const [successDialogOpen, setSuccessDialogOpen] = useState(false);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);

    const {
        newPassword,
        confirmPassword,
        isShowNewPassword,
        isShowConfirmPassword,
    } = formState;

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const inputChangeHandler = (event) => {
        setFormState({
            ...formState,
            [event.target.name]: event.target.value,
        });
    };

    const toggleShowNewPassword = () => {
        setFormState({
            ...formState,
            isShowNewPassword: !isShowNewPassword,
        });
    };

    const toggleShowConfirmPassword = () => {
        setFormState({
            ...formState,
            isShowConfirmPassword: !isShowConfirmPassword,
        });
    };

    const successDialogOpenHandler = () => setSuccessDialogOpen(true);
    const successDialogCloseHandler = () => {
        setSuccessDialogOpen(false);
        navigate("/login");
    };

    function successModal() {
        return (
            <>
                <Dialog
                    fullWidth
                    maxWidth="sm"
                    open={successDialogOpen}
                    onClose={successDialogCloseHandler}
                    classes={{ paper: styles.successModal }}>
                    <DialogTitle className={styles.successTitle}>
                        {"Password Changed!"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.successMessage}>
                            {
                                "Password changed successfully, You can login now."
                            }
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions className={styles.successAction}>
                        <Button
                            fullWidth
                            size="large"
                            onClick={successDialogCloseHandler}
                            className={styles.successButton}
                            autoFocus>
                            {"Login"}
                        </Button>
                    </DialogActions>
                </Dialog>
            </>
        );
    }

    const errorDialogOpenHandler = () => setErrorDialogOpen(true);
    const errorDialogCloseHandler = () => setErrorDialogOpen(false);

    function errorModal() {
        return (
            <>
                <Dialog
                    fullWidth
                    maxWidth="sm"
                    open={errorDialogOpen}
                    onClose={errorDialogCloseHandler}
                    classes={{ paper: styles.errorModal }}>
                    <DialogTitle className={styles.errorTitle}>
                        {"Password Change Failed"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.errorMessage}>
                            {"Passwords does not match. Please try again"}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions className={styles.errorAction}>
                        <Button
                            fullWidth
                            size="large"
                            onClick={errorDialogCloseHandler}
                            className={styles.errorButton}
                            autoFocus>
                            {"OK"}
                        </Button>
                    </DialogActions>
                </Dialog>
            </>
        );
    }

    const submitFormHandler = async (event) => {
        event.preventDefault();

        const isPassword1Valid = isValidPasswordLength(newPassword);
        const isPassword2Valid = isValidPasswordLength(confirmPassword);
        const arePasswordsEquals = arePasswordsEqual(
            newPassword,
            confirmPassword
        );

        if (isPassword1Valid && isPassword2Valid && arePasswordsEquals) {
            try {
                setIsLoading(true);
                await dispatch(
                    confirmPasswordReset({
                        uid,
                        token,
                        new_password: newPassword,
                        re_new_password: confirmPassword,
                    })
                );
                successDialogOpenHandler();
            } catch (error) {
                console.error(error);
                errorDialogOpenHandler();
            } finally {
                setIsLoading(false);
            }
        } else {
            errorDialogOpenHandler();
        }
    };

    return (
        <>
            <div className={styles.passwordContainer}>
                <Navbar />
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
                                            onClick={toggleShowNewPassword}
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
                                            onClick={toggleShowConfirmPassword}
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
                                <CircularProgress size={50} color="inherit" />
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

            {successModal()}
            {errorModal()}
        </>
    );
}

export default Password;
