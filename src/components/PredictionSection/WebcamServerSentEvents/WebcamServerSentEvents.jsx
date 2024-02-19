import { useSelector } from "react-redux";

import styles from "./WebcamServerSentEvents.module.css";

function WebcamServerSentEvents() {
    const webcamFrames = useSelector((state) => state.webcam.webcamFrames);

    return (
        <>
            <div className={styles.webcamCard}>
                <div className={styles.webcamTemplate}>
                    {webcamFrames.map((frame, index) => (
                        <img
                            key={index}
                            src={`data:image/jpeg;base64,${frame}`}
                            alt="Webcam Frames"
                            className={styles.renderedWebcamFrame}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}

export default WebcamServerSentEvents;
