import { AuthActions } from "./AuthActions";
import { Brand } from "./Brand";
import { cx } from "./cx";
import styles from "./Header.module.css";

interface SiteHeaderProps {
  /** "banner": camouflage strip (home page). "transparent": over a full-page photo (auth pages). */
  variant: "banner" | "transparent";
}

/** The original "Navigation" bar: logo plus account buttons, used on the home and auth pages. */
export function SiteHeader({ variant }: SiteHeaderProps) {
  return (
    <header className={cx(styles.siteHeader, variant === "banner" && styles.banner)}>
      <Brand className={styles.brandLight} />
      <AuthActions />
    </header>
  );
}
