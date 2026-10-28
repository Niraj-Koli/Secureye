import ImageSearchRoundedIcon from "@mui/icons-material/ImageSearchRounded";
import VideoFileRoundedIcon from "@mui/icons-material/VideoFileRounded";
import VoiceChatRoundedIcon from "@mui/icons-material/VoiceChatRounded";
import Button from "@mui/material/Button";
import { Link } from "react-router";

import { RibbonHeading } from "@/shared/ui/RibbonHeading";

import styles from "./Home.module.css";

const TOOLS = [
  {
    to: "/image",
    title: "Image File",
    Icon: ImageSearchRoundedIcon,
    description:
      "Our image detection system utilizes Machine Learning for object tracking in images, ensuring precise recognition to enable rapid responses.",
  },
  {
    to: "/video",
    title: "Video File",
    Icon: VideoFileRoundedIcon,
    description:
      "Our video analysis module utilizes advanced Machine Learning for offline video processing, generating timestamps for any identified object instantaneously.",
  },
  {
    to: "/live",
    title: "Live Video",
    Icon: VoiceChatRoundedIcon,
    description:
      "Our live footage module improves surveillance with real-time video analysis, focusing on immediate threat detection and generating alerts for potential danger.",
  },
];

/** "Secureye Tools". Signed-out visitors are sent to login first, then on to the tool. */
export function ToolCards() {
  return (
    <section aria-labelledby="tools-heading" className={styles.section}>
      <RibbonHeading id="tools-heading">Secureye Tools</RibbonHeading>
      <div className={styles.cards}>
        {TOOLS.map(({ to, title, Icon, description }) => (
          <article key={to} className={styles.toolCard}>
            <Icon className={styles.toolIcon} aria-hidden />
            <h3 className={styles.toolTitle}>{title}</h3>
            <p className={styles.toolDescription}>{description}</p>
            <Button
              component={Link}
              to={to}
              variant="contained"
              size="large"
              className={styles.toolButton}
            >
              {title}
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
