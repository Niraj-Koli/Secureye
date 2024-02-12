import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import OndemandVideoRoundedIcon from "@mui/icons-material/OndemandVideoRounded";
import VideoCameraBackRoundedIcon from "@mui/icons-material/VideoCameraBackRounded";

import styles from "./Home.module.css";

import Navbar from "@/components/Elementals/Navbar/Navbar";
import Model from "@/components/HomeSection/Model/Model";
import Slider from "@/components/HomeSection/Slider/Slider";
import Features from "@/components/HomeSection/Features/Features";
import About from "@/components/HomeSection/About/About";
// import Footer from "@/components/Elementals/Footer/Footer";

function Home() {
    return (
        <>
            <div className={styles.homeIntroContainer}>
                <Navbar />

                <div className={styles.modelSection}>
                    <div className={styles.videosModelCard}>
                        <Model
                            path="/video"
                            model="Offline Video Target Detection"
                            icon={
                                <OndemandVideoRoundedIcon
                                    sx={{ fontSize: "3rem" }}
                                />
                            }
                        />
                        <Model
                            path="/webcam"
                            model="Online Video Target Detection"
                            icon={
                                <VideoCameraBackRoundedIcon
                                    sx={{ fontSize: "3rem" }}
                                />
                            }
                        />
                    </div>
                    <div className={styles.imageModelCard}>
                        <Model
                            path="/image"
                            model="Image Target Detection"
                            icon={
                                <ImageRoundedIcon sx={{ fontSize: "3rem" }} />
                            }
                        />
                    </div>
                </div>
            </div>

            <div className={styles.contentContainer}>
                <div className={styles.sliderSection}>
                    <Slider />
                </div>
                <div className={styles.featuresSection}>
                    <Features />
                </div>
                <div className={styles.aboutSection}>
                    <About />
                </div>
            </div>

            <div className={styles.footerSection}>
                {/* <Footer /> */}
            </div>
        </>
    );
}

export default Home;
