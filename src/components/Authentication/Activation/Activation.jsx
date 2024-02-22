import { Suspense, lazy, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

import styles from "./Activation.module.css";

import { activateUserAccount } from "@/features/auth/authActions";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navbar = lazy(() => import("@/components/Elementals/Navbar/Navbar"));

function Activation() {
    const { uid, token } = useParams();

    const dispatch = useDispatch();
    const navigate = useNavigate();

    useEffect(() => {
        dispatch(activateUserAccount({ uid, token }));
        navigate("/login");
    }, [dispatch, navigate, uid, token]);

    return (
        <>
            <div className={styles.activationContainer}>
                <Suspense fallback={<Loading />}>
                    <Navbar />
                </Suspense>
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
