import { useSelector } from "react-redux";

import styles from "./ServerSentEvents.module.css";

function ServerSentEvents() {
    const videoFrames = useSelector((state) => state.video.videoFrames);

    return (
        <div className={styles.videoCard}>
            <div className={styles.videoTemplate}>
                {videoFrames.map((frame, index) => (
                    <img
                        key={index}
                        src={`data:image/jpeg;base64,${frame}`}
                        alt="Video Frames"
                        className={styles.renderedVideoFrame}
                    />
                ))}
            </div>
        </div>
    );
}

export default ServerSentEvents;
