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
    Typography,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";

import styles from "./Signup.module.css";

import { signupUserRequest } from "@/features/auth/authActions";

import Navbar from "@/components/Elementals/Navbar/Navbar";

const isValidUsername = (value) => /^[a-zA-Z0-9 ]+$/.test(value);
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPassword = (value) => value.trim().length > 7 && !/\s/.test(value);

function Signup() {
    const [formState, setFormState] = useState({
        name: "",
        email: "",
        password: "",
        isShowNewPassword: false,
    });

    const [isLoading, setIsLoading] = useState(false);
    const [successDialogOpen, setSuccessDialogOpen] = useState(false);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);

    const { name, email, password, isShowNewPassword } = formState;

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
        navigate("/login");
    };

    function successModal() {
        return (
            <>
                <Dialog
                    fullWidth
                    maxWidth="md"
                    open={successDialogOpen}
                    onClose={successDialogCloseHandler}
                    classes={{ paper: styles.successModal }}>
                    <DialogTitle className={styles.successTitle}>
                        {"Signup Successful"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.successMessage}>
                            <Typography className={styles.successTypography}>
                                {"Your account has been successfully created!"}
                            </Typography>
                            <Typography className={styles.successTypography}>
                                {
                                    "A confirmation link has been sent to your Gmail for account activation."
                                }
                            </Typography>
                            <Typography className={styles.successTypography}>
                                {
                                    "Please check your email and follow the instructions to activate your account."
                                }
                            </Typography>
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
                        {"Signup Failed"}
                    </DialogTitle>
                    <DialogContent>
                        <DialogContentText className={styles.errorMessage}>
                            {
                                "Invalid username, email or password. Please try again."
                            }
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

        const isUsernameValid = isValidUsername(name);
        const isEmailValid = isValidEmail(email);
        const isPasswordValid = isValidPassword(password);

        if (isUsernameValid && isEmailValid && isPasswordValid) {
            try {
                setIsLoading(true);
                await dispatch(signupUserRequest({ name, email, password }));
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
            <div className={styles.signupContainer}>
                <Navbar />
                <div className={styles.signupCard}>
                    <h1 className={styles.signupHeading}>{"Signup"}</h1>

                    <form
                        className={styles.signupForm}
                        noValidate
                        onSubmit={submitFormHandler}>
                        <TextField
                            margin="normal"
                            inputProps={{ className: styles.signupInput }}
                            InputLabelProps={{ className: styles.signupLabels }}
                            color="black"
                            required
                            fullWidth
                            label="Username"
                            name="name"
                            id="name"
                            type="text"
                            value={name}
                            onChange={inputChangeHandler}
                        />

                        <TextField
                            margin="normal"
                            inputProps={{ className: styles.signupInput }}
                            InputLabelProps={{ className: styles.signupLabels }}
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
                            inputProps={{ className: styles.signupInput }}
                            InputLabelProps={{ className: styles.signupLabels }}
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

                        <div className={styles.signupButtonContainer}>
                            {isLoading ? (
                                <CircularProgress size={50} color="inherit" />
                            ) : (
                                <Button
                                    type="submit"
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    className={styles.signupButton}
                                    disabled={isLoading}>
                                    {"Signup"}
                                </Button>
                            )}
                        </div>

                        <div className={styles.anchorsContainer}>
                            <NavLink to="/login" className={styles.anchors}>
                                {"Already have an account? Login"}
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

export default Signup;
