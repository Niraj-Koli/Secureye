import { Suspense, lazy, useEffect } from "react";

import styles from "./Home.module.css";

import beforeImage from "/static/beforeSliderImage.jpg";
import afterImage from "/static/afterSliderImage.jpg";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Navigation = lazy(() =>
    import("@/components/Elementals/Navigation/Navigation")
);
const Slider = lazy(() => import("@/components/HomeSection/Slider/Slider"));
const Features = lazy(() =>
    import("@/components/HomeSection/Features/Features")
);
const About = lazy(() => import("@/components/HomeSection/About/About"));
const Footer = lazy(() => import("@/components/Elementals/Footer/Footer"));

function Home() {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <>
            <div className={styles.homeIntroContainer}>
                <Suspense fallback={<Loading />}>
                    <Navigation />
                </Suspense>
            </div>

            <div className={styles.contentContainer}>
                <div className={styles.introSection}></div>
                <div className={styles.featuresSection}>
                    <Suspense fallback={<Loading />}>
                        <Features />
                    </Suspense>
                </div>
                <div className={styles.sliderSection}>
                    <Suspense fallback={<Loading />}>
                        <Slider
                            beforeImage={beforeImage}
                            afterImage={afterImage}
                        />
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
