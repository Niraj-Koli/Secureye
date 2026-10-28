import Button from "@mui/material/Button";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { logout } from "@/shared/auth/session";
import { useSession } from "@/shared/auth/store";

import styles from "./Header.module.css";

/** Login / Signup buttons, or Logout once signed in. */
export function AuthActions() {
  const status = useSession((state) => state.status);
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  async function handleLogout() {
    setLeaving(true);
    await logout();
    setLeaving(false);
    await navigate("/", { replace: true });
  }

  return (
    <div className={styles.actions}>
      {status === "authenticated" ? (
        <Button
          variant="contained"
          size="large"
          className={styles.button}
          disabled={leaving}
          onClick={() => void handleLogout()}
        >
          Logout
        </Button>
      ) : (
        <>
          <Button
            component={Link}
            to="/login"
            variant="contained"
            size="large"
            className={styles.button}
          >
            Login
          </Button>
          <Button
            component={Link}
            to="/signup"
            variant="contained"
            size="large"
            className={styles.button}
          >
            Signup
          </Button>
        </>
      )}
    </div>
  );
}
