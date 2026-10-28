import { Link } from "react-router";

import logo from "@/assets/images/logo.webp";

import { cx } from "./cx";
import styles from "./Header.module.css";

interface BrandProps {
  className?: string | undefined;
}

/** The Guardinger logo and "Secureye", linking home. */
export function Brand({ className }: BrandProps) {
  return (
    <Link to="/" className={cx(styles.brand, className)}>
      <img src={logo} alt="" width={50} height={50} className={styles.logo} />
      <span>Secureye</span>
    </Link>
  );
}
