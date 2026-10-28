import { cx } from "./cx";
import styles from "./RibbonHeading.module.css";

interface RibbonHeadingProps {
  id: string;
  children: string;
  tone?: "accent" | "dark";
  /** "large" for home page sections, "small" for the report cards on the detection pages. */
  size?: "large" | "small";
}

/** The original section titles: white text on an orange (or black) ribbon. */
export function RibbonHeading({
  id,
  children,
  tone = "accent",
  size = "large",
}: RibbonHeadingProps) {
  return (
    <h2 id={id} className={cx(styles.heading, size === "small" && styles.small)}>
      <span className={cx(styles.ribbon, tone === "dark" && styles.dark)}>{children}</span>
    </h2>
  );
}
