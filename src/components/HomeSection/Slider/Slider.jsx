import {
    ReactCompareSlider,
    ReactCompareSliderImage,
} from "react-compare-slider";

import styles from "./Slider.module.css";

import beforeImage from "/static/beforeImage.jpg";
import afterImage from "/static/afterImage.jpg";

function Slider() {
    return (
        <>
            <div className={styles.sliderContainer}>
                <h1 className={styles.sliderHeading}>Image Comparison</h1>

                <div className={styles.sliderCard}>
                    <ReactCompareSlider
                        boundsPadding={0}
                        itemOne={
                            <ReactCompareSliderImage
                                alt="Before Image"
                                style={{ borderRadius: "1.6rem" }}
                                src={beforeImage}
                            />
                        }
                        itemTwo={
                            <ReactCompareSliderImage
                                alt="After Image"
                                style={{ borderRadius: "1.6rem" }}
                                src={afterImage}
                            />
                        }
                        keyboardIncrement="5%"
                        position={50}
                        style={{
                            height: "90vh",
                            width: "100%",
                            borderRadius: "2rem",
                        }}
                    />
                </div>
            </div>
        </>
    );
}

export default Slider;
