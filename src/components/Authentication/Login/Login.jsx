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
    IconButton,
    InputAdornment,
    TextField,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";

import styles from "./Login.module.css";

import { loginUserRequest } from "@/features/auth/authActions";

import Navbar from "@/components/Elementals/Navbar/Navbar";

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPassword = (value) => value.trim().length > 7 && !/\s/.test(value);

function Login() {
    const [formState, setFormState] = useState({
        email: "",
        password: "",
        isShowNewPassword: false,
    });

    const [isLoading, setIsLoading] = useState(false);
    const [successDialogOpen, setSuccessDialogOpen] = useState(false);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);

    const { email, password, isShowNewPassword } = formState;

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const inputChangeHandler = (event) => {
        setFormState({
            ...formState,
            [event.target.name]: event.target.value,
        });
    };

    const toggleShowPassword = () => {
        setFormState({
            ...formState,
            isShowNewPassword: !isShowNewPassword,
        });
    };

    const successDialogOpenHandler = () => setSuccessDialogOpen(true);
    const successDialogCloseHandler = () => {
        setSuccessDialogOpen(false);
        navigate("/");
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
                        {"Login Successful"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.successMessage}>
                            {"Welcome! You have successfully logged in."}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions className={styles.successAction}>
                        <Button
                            fullWidth
                            size="large"
                            onClick={successDialogCloseHandler}
                            className={styles.successButton}
                            autoFocus>
                            {"Explore"}
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
                        {"Login Failed"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.errorMessage}>
                            {"Invalid email or password. Please try again."}
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
        const isPasswordValid = isValidPassword(password);

        if (isEmailValid && isPasswordValid) {
            try {
                setIsLoading(true);
                await dispatch(loginUserRequest({ email, password }))
                    .then((action) => {
                        const response = action.payload;

                        if (response) {
                            successDialogOpenHandler();
                        } else {
                            errorDialogOpenHandler();
                        }
                    })
                    .catch((error) => {
                        console.error(error);
                        errorDialogOpenHandler();
                    })
                    .finally(() => {
                        setIsLoading(false);
                    });
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
            <div className={styles.loginContainer}>
                <Navbar />
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
                                <CircularProgress size={50} color="inherit" />
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

            {successModal()}
            {errorModal()}
        </>
    );
}

export default Login;
