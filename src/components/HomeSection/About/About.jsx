import { Suspense, lazy } from "react";

import styles from "./About.module.css";

import vision from "/static/vision.jpg";
import mission from "/static/mission.jpeg";

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));
const Img = lazy(() => import("@/components/Elementals/Img/Img"));

function About() {
    return (
        <>
            <div className={styles.aboutContainer}>
                <h1 className={styles.aboutHeading}>{"About Us"}</h1>

                <div className={styles.about}>
                    <div className={styles.aboutCard}>
                        <h3 className={styles.aboutTitle}>{"Our Vision"}</h3>
                        <p className={styles.aboutDescription}>
                            {
                                "Revolutionizing military security, our advanced Machine Learning prioritizes real-time detection in surveillance. Our system swiftly identifies threats, seamlessly integrates with existing systems for proactive defense, and undergoes rigorous testing. The robust solution generates precise alerts with location data, setting a new standard in national defense and armed forces, enhancing global security against emerging threats."
                            }
                        </p>
                        <Suspense fallback={<Loading />}>
                            <Img
                                src={vision}
                                alt="Vision"
                                className={styles.aboutImage}
                            />
                        </Suspense>
                    </div>
                    <div className={styles.aboutCard}>
                        <h3 className={styles.aboutTitle}>{"Our Mission"}</h3>
                        <p className={styles.aboutDescription}>
                            {
                                "The project aims to craft an advanced Machine Learning solution for military security, emphasizing real-time detection of threats like weapons and armored vehicles. Key objectives include robust object recognition, real-time detection techniques, accurate alert systems with location data, and ensuring system reliability through comprehensive testing. The goal is to fortify national defense with a proactive and adaptable defense mechanism."
                            }
                        </p>
                        <Suspense fallback={<Loading />}>
                            <Img
                                src={mission}
                                alt="Mission"
                                className={styles.aboutImage}
                            />
                        </Suspense>
                    </div>
                </div>
            </div>
        </>
    );
}

export default About;
