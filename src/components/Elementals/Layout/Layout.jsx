import PropTypes from "prop-types";
import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useDispatch } from "react-redux";

import { verifyAuthentication, fetchUser } from "@/features/auth/authActions";
import { resetPrediction } from "@/features/prediction/predictionSlice";

function Layout({ title, children }) {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(verifyAuthentication());
    }, [dispatch]);

    useEffect(() => {
        dispatch(fetchUser());
    }, [dispatch]);

    useEffect(() => {
        dispatch(resetPrediction());
    }, [dispatch]);

    return (
        <>
            <Helmet key={title}>
                <title>{title}</title>

                <meta
                    name="description"
                    content="Detecting farm field fertility through camera images or satellites."
                />
                <meta
                    name="keywords"
                    content="farm field, fertility, detection, camera images, satellites"
                />

                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />

                <meta name="author" content="Guardinger" />

                <meta
                    property="og:title"
                    content="Detecting Farm Field Fertility"
                />

                <meta
                    property="og:description"
                    content="Advanced technology for assessing farm field fertility using camera images and satellite data."
                />
            </Helmet>

            <div>{children}</div>
        </>
    );
}

Layout.propTypes = {
    title: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired,
};

export default Layout;
