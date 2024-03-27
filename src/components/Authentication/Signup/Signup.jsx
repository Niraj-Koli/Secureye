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
    Typography,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";

import styles from "./Signup.module.css";

import { signupUserRequest } from "@/features/auth/authActions";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navigation = lazy(() =>
    import("@/components/Elementals/Navigation/Navigation")
);

const isValidUsername = (value) => /^[a-zA-Z0-9 ]+$/.test(value);
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPassword = (value) => value.trim().length > 7 && !/\s/.test(value);

function Signup() {
    const [isLoading, setIsLoading] = useState(false);
    const [formState, setFormState] = useState({
        name: "",
        email: "",
        password: "",
        isShowNewPassword: false,
    });
    const [dialogState, setDialogState] = useState({
        open: false,
        type: "success",
        message: "",
    });

    const { name, email, password, isShowNewPassword } = formState;
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
            navigate("/login");
        }
    }, [navigate, type]);

    const submitFormHandler = useCallback(
        (event) => {
            event.preventDefault();

            const isUsernameValid = isValidUsername(name);
            const isEmailValid = isValidEmail(email);
            const isPasswordValid = isValidPassword(password);

            if (isUsernameValid && isEmailValid && isPasswordValid) {
                setIsLoading(true);
                dispatch(signupUserRequest({ name, email, password }))
                    .then((action) => {
                        const response = action.payload;

                        if (response) {
                            setDialogState({
                                open: true,
                                type: "success",
                                message: (
                                    <>
                                        <Typography
                                            className={
                                                styles.successTypography
                                            }>
                                            {
                                                "Your account has been successfully created!"
                                            }
                                        </Typography>
                                        <Typography
                                            className={
                                                styles.successTypography
                                            }>
                                            {
                                                "A confirmation link has been sent to your Gmail for account activation."
                                            }
                                        </Typography>
                                        <Typography
                                            className={
                                                styles.successTypography
                                            }>
                                            {
                                                "Please check your email and follow the instructions to activate your account."
                                            }
                                        </Typography>
                                    </>
                                ),
                            });
                        } else {
                            setDialogState({
                                open: true,
                                type: "error",
                                message:
                                    "User with this email address already exists or password is similar to email. Please Check!",
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
                    message:
                        "Invalid username, email or password. Please try again.",
                });
            }
        },
        [dispatch, email, name, password]
    );

    return (
        <>
            <div className={styles.signupContainer}>
                <Suspense fallback={<Loading />}>
                    <Navigation />
                </Suspense>
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

            <Dialog
                fullWidth
                maxWidth={type === "success" ? "md" : "sm"}
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
                    {type === "success" ? "Signup Successful" : "Signup Failed"}
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

export default Signup;
