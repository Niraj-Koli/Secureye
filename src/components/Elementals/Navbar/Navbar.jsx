import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";

import { Button } from "@mui/material";

import styles from "./Navbar.module.css";

import { logout } from "@/features/auth/authSlice";

import guardingerLogo from "/static/guardingerLogo.png";

function Navbar() {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

    const logoutUserHandler = useCallback(() => {
        dispatch(logout());
        navigate("/");
    }, [dispatch, navigate]);

    const navContent = useMemo(() => {
        return (
            <div className={styles.navContent}>
                <NavLink to="/" className={styles.navItem}>
                    {"Home"}
                </NavLink>
                <NavLink to="/image" className={styles.navItem}>
                    {"Image"}
                </NavLink>
                <NavLink to="/video" className={styles.navItem}>
                    {"Video"}
                </NavLink>
                <NavLink to="/webcam" className={styles.navItem}>
                    {"Webcam"}
                </NavLink>
            </div>
        );
    }, []);

    return (
        <>
            <nav className={styles.navbar}>
                <div className={styles.navHeader}>
                    <NavLink to="/" className={styles.brand}>
                        <img
                            src={guardingerLogo}
                            alt="Guardinger Logo"
                            className={styles.logo}
                        />

                        <span>{"Secureye"}</span>
                    </NavLink>
                </div>

                {navContent}

                <div className={styles.actions}>
                    {isAuthenticated ? (
                        <>
                            <Button
                                variant="contained"
                                size="large"
                                className={styles.buttons}
                                onClick={logoutUserHandler}>
                                {"Logout"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <NavLink to="/login">
                                <Button
                                    variant="contained"
                                    size="large"
                                    className={styles.buttons}>
                                    {"Login"}
                                </Button>
                            </NavLink>
                            <NavLink to="/signup">
                                <Button
                                    variant="contained"
                                    size="large"
                                    className={styles.buttons}>
                                    {"Signup"}
                                </Button>
                            </NavLink>
                        </>
                    )}
                </div>
            </nav>
        </>
    );
}

export default Navbar;
