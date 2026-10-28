import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";

import after from "@/assets/images/compare-after.webp";
import before from "@/assets/images/compare-before.webp";
import { RibbonHeading } from "@/shared/ui/RibbonHeading";

import styles from "./Home.module.css";

/** "Image Comparison": a photo before and after Secureye's detections, split by a slider. */
export function CompareSlider() {
  return (
    <section aria-labelledby="compare-heading" className={styles.compareSection}>
      <RibbonHeading id="compare-heading" tone="dark">
        Image Comparison
      </RibbonHeading>
      <div className={styles.compareCard}>
        <ReactCompareSlider
          className={styles.compare}
          boundsPadding="0px"
          defaultPosition={50}
          keyboardIncrement="5%"
          itemOne={<ReactCompareSliderImage src={before} alt="Soldiers in a ruined building" />}
          itemTwo={
            <ReactCompareSliderImage
              src={after}
              alt="The same photo with Secureye's detections boxed and labelled"
            />
          }
        />
      </div>
    </section>
  );
}
