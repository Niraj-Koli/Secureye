import PropTypes from "prop-types";

function Img({ src, alt, className }) {
    return <img src={src} alt={alt} className={className} />;
}

Img.propTypes = {
    src: PropTypes.string.isRequired,
    alt: PropTypes.string.isRequired,
    className: PropTypes.string,
};

export default Img;
