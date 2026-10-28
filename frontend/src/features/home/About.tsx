import mission from "@/assets/images/mission.webp";
import vision from "@/assets/images/vision.webp";
import { RibbonHeading } from "@/shared/ui/RibbonHeading";

import styles from "./Home.module.css";

const STATEMENTS = [
  {
    title: "Our Vision",
    image: vision,
    alt: "Vision",
    text: "Revolutionizing military security, our advanced Machine Learning prioritizes real-time detection in surveillance. Our system swiftly identifies threats, seamlessly integrates with existing systems for proactive defense, and undergoes rigorous testing. The robust solution generates precise alerts with location data, setting a new standard in national defense and armed forces, enhancing global security against emerging threats.",
  },
  {
    title: "Our Mission",
    image: mission,
    alt: "Mission",
    text: "The project aims to craft an advanced Machine Learning solution for military security, emphasizing real-time detection of threats like weapons and armored vehicles. Key objectives include robust object recognition, real-time detection techniques, accurate alert systems and ensuring system reliability through comprehensive testing. The goal is to fortify national defense with a proactive and adaptable defense mechanism.",
  },
];

export function About() {
  return (
    <section aria-labelledby="about-heading" className={styles.section}>
      <RibbonHeading id="about-heading">About Us</RibbonHeading>
      <div className={styles.cards}>
        {STATEMENTS.map(({ title, image, alt, text }) => (
          <article key={title} className={styles.aboutCard}>
            <h3 className={styles.aboutTitle}>{title}</h3>
            <p className={styles.aboutText}>{text}</p>
            <img src={image} alt={alt} loading="lazy" className={styles.aboutImage} />
          </article>
        ))}
      </div>
    </section>
  );
}
