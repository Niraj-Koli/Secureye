import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

import styles from "./Activation.module.css";

import { activateUserAccount } from "@/features/auth/authActions";

import Navbar from "@/components/Elementals/Navbar/Navbar";

function Activation() {
    const [isVerified, setIsVerified] = useState(false);

    const { uid, token } = useParams();

    const dispatch = useDispatch();
    const navigate = useNavigate();

    useEffect(() => {
        dispatch(activateUserAccount({ uid, token }));
        setIsVerified(true);
    }, [dispatch, uid, token]);

    useEffect(() => {
        if (isVerified) {
            navigate("/login");
        }
    }, [isVerified, navigate]);

    return (
        <>
            <div className={styles.activationContainer}>
                <Navbar />
                <div className={styles.activationCard}>
                    <h1 className={styles.activationHeading}>
                        {"Activate Your Account"}
                    </h1>
                </div>
            </div>
        </>
    );
}

export default Activation;
