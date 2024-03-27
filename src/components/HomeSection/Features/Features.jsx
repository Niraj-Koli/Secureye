import { Suspense, lazy } from "react";
import { useSelector } from "react-redux";
import { NavLink } from "react-router-dom";
import { Button } from "@mui/material";

import ImageSearchRoundedIcon from "@mui/icons-material/ImageSearchRounded";
import VideoFileRoundedIcon from "@mui/icons-material/VideoFileRounded";
import VoiceChatRoundedIcon from "@mui/icons-material/VoiceChatRounded";

import styles from "./Features.module.css";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));

function Features() {
    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

    return (
        <>
            <div className={styles.featuresContainer}>
                <h1 className={styles.featuresHeading}>
                    <span>{"Secureye Tools"}</span>
                </h1>

                <div className={styles.features}>
                    <div className={styles.featuresCard}>
                        <Suspense fallback={<Loading />}>
                            <ImageSearchRoundedIcon
                                sx={{
                                    fontSize: 100,
                                    color: "#ff5c33",
                                }}
                            />
                        </Suspense>
                        <h3 className={styles.featureTitle}>{"Image"}</h3>
                        <p className={styles.featureDescription}>
                            {
                                "Our image detection system utilizes Machine Learning for object tracking in images, ensuring precise recognition to enable rapid responses."
                            }
                        </p>
                        <NavLink to={isAuthenticated ? "/image" : "/login"}>
                            <Button
                                variant="contained"
                                size="large"
                                fullWidth
                                className={styles.modelsButtons}>
                                {"Image"}
                            </Button>
                        </NavLink>
                    </div>
                    <div className={styles.featuresCard}>
                        <Suspense fallback={<Loading />}>
                            <VideoFileRoundedIcon
                                sx={{
                                    fontSize: 100,
                                    color: "#ff5c33",
                                }}
                            />
                        </Suspense>
                        <h3 className={styles.featureTitle}>{"Video"}</h3>
                        <p className={styles.featureDescription}>
                            {
                                "Our video analysis module utilizes advanced Machine Learning for offline video processing, generating timestamps for any identified object instantaneously."
                            }
                        </p>
                        <NavLink to={isAuthenticated ? "/video" : "/login"}>
                            <Button
                                variant="contained"
                                size="large"
                                fullWidth
                                className={styles.modelsButtons}>
                                {"Video"}
                            </Button>
                        </NavLink>
                    </div>
                    <div className={styles.featuresCard}>
                        <Suspense fallback={<Loading />}>
                            <VoiceChatRoundedIcon
                                sx={{
                                    fontSize: 100,
                                    color: "#ff5c33",
                                }}
                            />
                        </Suspense>
                        <h3 className={styles.featureTitle}>{"Webcam"}</h3>
                        <p className={styles.featureDescription}>
                            {
                                "Our live footage module improves surveillance with real-time video analysis, focusing on immediate threat detection and generating alerts for potential danger."
                            }
                        </p>
                        <NavLink to={isAuthenticated ? "/webcam" : "/login"}>
                            <Button
                                variant="contained"
                                size="large"
                                fullWidth
                                className={styles.modelsButtons}>
                                {"Webcam"}
                            </Button>
                        </NavLink>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Features;
