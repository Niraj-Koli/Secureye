import { useMemo } from "react";
import { useSelector } from "react-redux";

import styles from "./VideoServerSentEvents.module.css";

function VideoServerSentEvents() {
    const videoFrames = useSelector((state) => state.video.videoFrames);

    const memoizedVideoFrames = useMemo(() => videoFrames, [videoFrames]);

    return (
        <>
            <div className={styles.videoCard}>
                <div className={styles.videoTemplate}>
                    {memoizedVideoFrames.map((frame, index) => (
                        <img
                            key={index}
                            src={`data:image/jpeg;base64,${frame}`}
                            alt="Video Frames"
                            className={styles.renderedVideoFrame}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}

export default VideoServerSentEvents;
