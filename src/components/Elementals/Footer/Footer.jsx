import { useSelector } from "react-redux";
import { NavLink } from "react-router-dom";

import LinkedInIcon from "@mui/icons-material/LinkedIn";
import TwitterIcon from "@mui/icons-material/Twitter";
import InstagramIcon from "@mui/icons-material/Instagram";
import LocalPhoneRoundedIcon from "@mui/icons-material/LocalPhoneRounded";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import LaunchSharpIcon from "@mui/icons-material/LaunchSharp";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import ImportContactsRoundedIcon from "@mui/icons-material/ImportContactsRounded";
import NavigationRoundedIcon from "@mui/icons-material/NavigationRounded";

import styles from "./Footer.module.css";

function Footer() {
    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

    return (
        <>
            <div className={styles.footerContainer}>
                <div className={styles.socialContainer}>
                    <div>
                        <NavLink to="/" className={styles.socialHeading}>
                            <VisibilityRoundedIcon className={styles.logos} />
                            {"Secureye ©"}
                        </NavLink>
                    </div>

                    <div>
                        <p className={styles.description}>
                            {"Elevate Unlimited Possibilities"}
                            <br></br>
                            {"With Our Smart Innovations"}
                        </p>
                    </div>

                    <div className={styles.socials}>
                        <NavLink to="" className={styles.socialDetail}>
                            <LinkedInIcon className={styles.socialIcon} />
                        </NavLink>
                        <NavLink to="" className={styles.socialDetail}>
                            <TwitterIcon className={styles.socialIcon} />
                        </NavLink>
                        <NavLink to="" className={styles.socialDetail}>
                            <InstagramIcon className={styles.socialIcon} />
                        </NavLink>
                    </div>
                </div>

                <div className={styles.contacts}>
                    <div className={styles.contactsHeading}>
                        <ImportContactsRoundedIcon className={styles.logos} />
                        {"Contacts"}
                    </div>
                    <div className={styles.contactDetail}>
                        <LocalPhoneRoundedIcon
                            className={styles.contactIcons}
                        />
                        {"+91-9876543210"}
                    </div>
                    <div className={styles.contactDetail}>
                        <EmailRoundedIcon className={styles.contactIcons} />
                        {"mail@secureye.com"}
                    </div>
                    <div className={styles.contactDetail}>
                        <LocationOnRoundedIcon
                            className={styles.contactIcons}
                        />
                        {"Mumbai, India"}
                    </div>
                </div>

                <div className={styles.navigation}>
                    <div className={styles.navigateHeading}>
                        <NavigationRoundedIcon className={styles.logos} />
                        {"Navigate"}
                    </div>
                    <div className={styles.navigationLinks}>
                        <LaunchSharpIcon className={styles.navigatelink} />
                        <NavLink
                            to={isAuthenticated ? "/image" : "/login"}
                            className={styles.link}>
                            {"Image"}
                        </NavLink>
                    </div>
                    <div className={styles.navigationLinks}>
                        <LaunchSharpIcon className={styles.navigatelink} />
                        <NavLink
                            to={isAuthenticated ? "/video" : "/login"}
                            className={styles.link}>
                            {"Video"}
                        </NavLink>
                    </div>
                    <div className={styles.navigationLinks}>
                        <LaunchSharpIcon className={styles.navigatelink} />
                        <NavLink
                            to={isAuthenticated ? "/webcam" : "/login"}
                            className={styles.link}>
                            {"Webcam"}
                        </NavLink>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Footer;
