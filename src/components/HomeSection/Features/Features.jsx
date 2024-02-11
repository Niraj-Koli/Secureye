import styles from "./Features.module.css";

import image from "/static/image.jpg";
import video from "/static/video.png";
import webcam from "/static/webcam.png";

function Features() {
    return (
        <>
            <div className={styles.featuresContainer}>
                <h1 className={styles.featuresHeading}>{"Secureye Features"}</h1>

                <div className={styles.features}>
                    <div className={styles.featuresCard}>
                        <img
                            src={image}
                            alt="Image"
                            className={styles.featureImage}
                        />
                        <h3 className={styles.featureTitle}>{"Image"}</h3>
                        <p className={styles.featureDescription}>
                            {
                                "Our image detection module employs advanced Machine Learning to swiftly identify objects in real-time within surveillance environments. The robust object recognition system ensures precision, contributing to rapid responses. Alerts include precise location data, enhancing the proactive defense mechanism."
                            }
                        </p>
                    </div>
                    <div className={styles.featuresCard}>
                        <img
                            src={video}
                            alt="Video"
                            className={styles.featureImage}
                        />
                        <h3 className={styles.featureTitle}>{"Video"}</h3>
                        <p className={styles.featureDescription}>
                            {
                                "Our application's video analysis module utilizes advanced Machine Learning to process offline video feeds. The module generates alerts with precise location data, enabling swift responses to potential threats. Rigorous testing guarantees accuracy, setting a new standard for real-time threat identification in military security."
                            }
                        </p>
                    </div>
                    <div className={styles.featuresCard}>
                        <img
                            src={webcam}
                            className={styles.featureImage}
                            alt="Webcam"
                        />
                        <h3 className={styles.featureTitle}>{"Webcam"}</h3>
                        <p className={styles.featureDescription}>
                            {
                                "Our live footage module enhances surveillance with real-time video analysis, focusing on immediate threat detection such as weapons and armored vehicles. it ensures a proactive defense mechanism by swiftly alerting to potential dangers. The module generates alerts with precise location data, facilitating rapid and targeted responses."
                            }
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Features;
