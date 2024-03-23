import PropTypes from "prop-types";

import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import { useDispatch } from "react-redux";

import { verifyAuthentication, fetchUser } from "@/features/auth/authActions";
import { resetImagePrediction } from "@/features/image/imageSlice";
import {
    resetVideoPrediction,
    resetVideoDetectedObjects,
} from "@/features/video/videoSlice";
import {
    resetWebcamPrediction,
    resetWebcamDetectedObjects,
} from "@/features/webcam/webcamSlice";

function Layout({ title, children }) {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(fetchUser());
        dispatch(verifyAuthentication());
        dispatch(resetImagePrediction());
        dispatch(resetVideoPrediction());
        dispatch(resetVideoDetectedObjects());
        dispatch(resetWebcamPrediction());
        dispatch(resetWebcamDetectedObjects());
    }, [dispatch]);

    const helmetProps = useMemo(
        () => ({
            key: title,
            title: title,
            meta: [
                {
                    name: "description",
                    content:
                        "Detecting farm field fertility through camera images or satellites.",
                },
                {
                    name: "keywords",
                    content:
                        "farm field, fertility, detection, camera images, satellites",
                },
                {
                    name: "viewport",
                    content: "width=device-width, initial-scale=1.0",
                },
                {
                    name: "author",
                    content: "Guardinger",
                },
                {
                    property: "og:title",
                    content: "Detecting Farm Field Fertility",
                },
                {
                    property: "og:description",
                    content:
                        "Advanced technology for assessing farm field fertility using camera images and satellite data.",
                },
            ],
        }),
        [title]
    );

    return (
        <>
            <Helmet {...helmetProps} />
            <div>{children}</div>
        </>
    );
}

Layout.propTypes = {
    title: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired,
};

export default Layout;
