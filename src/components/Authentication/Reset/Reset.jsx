import { useState } from "react";
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

import Navbar from "@/components/Elementals/Navbar/Navbar";

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function Reset() {
    const [formState, setFormState] = useState({
        email: "",
    });

    const [isLoading, setIsLoading] = useState(false);
    const [successDialogOpen, setSuccessDialogOpen] = useState(false);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);

    const { email } = formState;

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const inputChangeHandler = (event) => {
        setFormState({
            ...formState,
            [event.target.name]: event.target.value,
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
                        {"Reset Password Link Sent"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.successMessage}>
                            {
                                "An email with instructions to reset your password has been sent. Please check your email."
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
                            {"OK"}
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
                        {"Reset Process Failed"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.errorMessage}>
                            {"Invalid email. Please try again."}
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

        const isEmailValid = isValidEmail(email);

        if (isEmailValid) {
            try {
                setIsLoading(true);
                await dispatch(requestPasswordReset(email));
                successDialogOpenHandler();
            } catch (error) {
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
            <div className={styles.resetContainer}>
                <Navbar />
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
                                <CircularProgress size={50} color="inherit" />
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

            {successModal()}
            {errorModal()}
        </>
    );
}

export default Reset;
