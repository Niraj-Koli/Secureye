import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import { useState } from "react";
import { NavLink } from "react-router";

import { AuthActions } from "./AuthActions";
import { Brand } from "./Brand";
import { cx } from "./cx";
import styles from "./Header.module.css";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/image", label: "Image" },
  { to: "/video", label: "Video" },
  { to: "/live", label: "Live Video" },
] as const;

function navItemClass({ isActive }: { isActive: boolean }): string {
  return cx(styles.navItem, isActive && styles.navItemActive);
}

/** The detection pages' top bar: logo, page links and account buttons (a menu on phones). */
export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const links = NAV_LINKS.map(({ to, label }) => (
    <NavLink
      key={to}
      to={to}
      end
      className={navItemClass}
      onClick={() => {
        setMenuOpen(false);
      }}
    >
      {label}
    </NavLink>
  ));

  return (
    <header className={styles.navbar}>
      <Brand />
      <nav aria-label="Main" className={styles.navLinks}>
        {links}
      </nav>
      <div className={styles.desktopOnly}>
        <AuthActions />
      </div>
      <IconButton
        className={styles.menuButton}
        aria-label="Open menu"
        onClick={() => {
          setMenuOpen(true);
        }}
      >
        <MenuRoundedIcon fontSize="large" />
      </IconButton>
      <Drawer
        anchor="right"
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
        }}
      >
        <nav aria-label="Main" className={styles.drawer}>
          {links}
          <AuthActions />
        </nav>
      </Drawer>
    </header>
  );
}
