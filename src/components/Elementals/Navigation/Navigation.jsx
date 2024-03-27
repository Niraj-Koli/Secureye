import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";

import { Button } from "@mui/material";

import styles from "./Navigation.module.css";

import { logout } from "@/features/auth/authSlice";

import guardingerLogo from "/static/guardingerLogo.png";

function Navigation() {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

    const logoutUserHandler = useCallback(() => {
        dispatch(logout());
        navigate("/");
    }, [dispatch, navigate]);

    return (
        <>
            <nav className={styles.navigation}>
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

export default Navigation;
