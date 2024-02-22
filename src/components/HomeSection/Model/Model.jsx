import PropTypes from "prop-types";

import { useSelector } from "react-redux";
import { NavLink } from "react-router-dom";

import { Button } from "@mui/material";

import styles from "./Model.module.css";

function Model({ path, model, icon }) {
    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

    return (
        <>
            <NavLink to={!isAuthenticated ? "/" : `${path}`}>
                <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    className={styles.modelButton}
                    disabled={!isAuthenticated}>
                    <div className={styles.modelContent}>
                        <div>{model}</div>
                        {icon}
                    </div>
                </Button>
            </NavLink>
        </>
    );
}

Model.propTypes = {
    path: PropTypes.string.isRequired,
    model: PropTypes.string.isRequired,
    icon: PropTypes.node.isRequired,
};

export default Model;
