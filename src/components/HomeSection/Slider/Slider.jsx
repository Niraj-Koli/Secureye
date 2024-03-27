import PropTypes from "prop-types";

import {
    ReactCompareSlider,
    ReactCompareSliderImage,
} from "react-compare-slider";

import styles from "./Slider.module.css";

function Slider({ beforeImage, afterImage }) {
    return (
        <>
            <div className={styles.sliderContainer}>
                <h1 className={styles.sliderHeading}>
                    <span>{"Image Comparison"}</span>
                </h1>

                <div className={styles.sliderCard}>
                    <ReactCompareSlider
                        boundsPadding={0}
                        itemOne={
                            <ReactCompareSliderImage
                                alt="Before Image"
                                src={beforeImage}
                            />
                        }
                        itemTwo={
                            <ReactCompareSliderImage
                                alt="After Image"
                                src={afterImage}
                            />
                        }
                        keyboardIncrement="5%"
                        position={50}
                        style={{
                            height: "100%",
                            width: "100%",
                            objectFit: "cover",
                            borderRadius: "0.8rem",
                        }}
                    />
                </div>
            </div>
        </>
    );
}

Slider.propTypes = {
    beforeImage: PropTypes.string.isRequired,
    afterImage: PropTypes.string.isRequired,
};

export default Slider;
