import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import ImportContactsRoundedIcon from "@mui/icons-material/ImportContactsRounded";
import InstagramIcon from "@mui/icons-material/Instagram";
import LaunchSharpIcon from "@mui/icons-material/LaunchSharp";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import LocalPhoneRoundedIcon from "@mui/icons-material/LocalPhoneRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import NavigationRoundedIcon from "@mui/icons-material/NavigationRounded";
import TwitterIcon from "@mui/icons-material/Twitter";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { Link } from "react-router";

import styles from "./Footer.module.css";

// The original's icons linked nowhere; these point at the platforms until real profiles exist.
const SOCIALS = [
  { href: "https://www.linkedin.com/", label: "LinkedIn", Icon: LinkedInIcon },
  { href: "https://x.com/", label: "Twitter", Icon: TwitterIcon },
  { href: "https://www.instagram.com/", label: "Instagram", Icon: InstagramIcon },
];

const PAGES = [
  { to: "/image", label: "Image File" },
  { to: "/video", label: "Video File" },
  { to: "/live", label: "Live Video" },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.column}>
        <Link to="/" className={styles.heading}>
          <VisibilityRoundedIcon className={styles.headingIcon} />
          Secureye ©
        </Link>
        <p className={styles.description}>
          Safeguarding Sovereignty,
          <br />
          Defending the Protectors.
        </p>
        <div className={styles.socials}>
          {SOCIALS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={styles.social}
            >
              <Icon className={styles.socialIcon} />
            </a>
          ))}
        </div>
      </div>

      <div className={styles.column}>
        <h2 className={styles.heading}>
          <ImportContactsRoundedIcon className={styles.headingIcon} />
          Contacts
        </h2>
        <p className={styles.item}>
          <LocalPhoneRoundedIcon className={styles.itemIcon} />
          +91-9876543210
        </p>
        <p className={styles.item}>
          <EmailRoundedIcon className={styles.itemIcon} />
          mail@secureye.com
        </p>
        <p className={styles.item}>
          <LocationOnRoundedIcon className={styles.itemIcon} />
          Mumbai, India
        </p>
      </div>

      <nav aria-label="Detection tools" className={styles.column}>
        <h2 className={styles.heading}>
          <NavigationRoundedIcon className={styles.headingIcon} />
          Navigate
        </h2>
        {/* Signed-out visitors are sent to the login page, then on to the tool. */}
        {PAGES.map(({ to, label }) => (
          <Link key={to} to={to} className={styles.item}>
            <LaunchSharpIcon className={styles.itemIcon} />
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
