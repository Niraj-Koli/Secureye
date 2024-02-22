import { Suspense, lazy, useMemo } from "react";

import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import OndemandVideoRoundedIcon from "@mui/icons-material/OndemandVideoRounded";
import VideoCameraBackRoundedIcon from "@mui/icons-material/VideoCameraBackRounded";

import styles from "./Home.module.css";

import beforeImage from "/static/beforeImage.jpg";
import afterImage from "/static/afterImage.jpg";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navbar = lazy(() => import("@/components/Elementals/Navbar/Navbar"));
const Model = lazy(() => import("@/components/HomeSection/Model/Model"));
const Slider = lazy(() => import("@/components/HomeSection/Slider/Slider"));
const Features = lazy(() =>
    import("@/components/HomeSection/Features/Features")
);
const About = lazy(() => import("@/components/HomeSection/About/About"));
const Footer = lazy(() => import("@/components/Elementals/Footer/Footer"));

function Home() {
    const imageModel = useMemo(
        () => (
            <Suspense fallback={<Loading />}>
                <Model
                    path="/image"
                    model="Image Target Detection"
                    icon={<ImageRoundedIcon sx={{ fontSize: "3rem" }} />}
                />
            </Suspense>
        ),
        []
    );

    const videoModel = useMemo(
        () => (
            <Suspense fallback={<Loading />}>
                <Model
                    path="/video"
                    model="Offline Video Target Detection"
                    icon={
                        <OndemandVideoRoundedIcon sx={{ fontSize: "3rem" }} />
                    }
                />
            </Suspense>
        ),
        []
    );

    const webcamModel = useMemo(
        () => (
            <Suspense fallback={<Loading />}>
                <Model
                    path="/webcam"
                    model="Online Video Target Detection"
                    icon={
                        <VideoCameraBackRoundedIcon sx={{ fontSize: "3rem" }} />
                    }
                />
            </Suspense>
        ),
        []
    );

    return (
        <>
            <div className={styles.homeIntroContainer}>
                <Suspense fallback={<Loading />}>
                    <Navbar />
                </Suspense>

                <div className={styles.modelSection}>
                    <div className={styles.videosModelCard}>
                        {videoModel}
                        {webcamModel}
                    </div>
                    <div className={styles.imageModelCard}>{imageModel}</div>
                </div>
            </div>

            <div className={styles.contentContainer}>
                <div className={styles.sliderSection}>
                    <Suspense fallback={<Loading />}>
                        <Slider
                            beforeImage={beforeImage}
                            afterImage={afterImage}
                        />
                    </Suspense>
                </div>
                <div className={styles.featuresSection}>
                    <Suspense fallback={<Loading />}>
                        <Features />
                    </Suspense>
                </div>
                <div className={styles.aboutSection}>
                    <Suspense fallback={<Loading />}>
                        <About />
                    </Suspense>
                </div>
            </div>

            <div className={styles.footerSection}>
                <Suspense fallback={<Loading />}>
                    <Footer />
                </Suspense>
            </div>
        </>
    );
}

export default Home;
