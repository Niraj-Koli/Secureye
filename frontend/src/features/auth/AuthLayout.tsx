import type { ReactNode } from "react";

import { Page } from "@/shared/ui/Page";
import { SiteHeader } from "@/shared/ui/SiteHeader";

import styles from "./Auth.module.css";

interface AuthLayoutProps {
  /** Tab title, e.g. "Login Page". */
  title: string;
  heading: string;
  children: ReactNode;
}

/** The original account screens: a white card over the soldiers photo, under the header. */
export function AuthLayout({ title, heading, children }: AuthLayoutProps) {
  return (
    <Page title={title}>
      <div className={styles.backdrop}>
        <SiteHeader variant="transparent" />
        <main className={styles.main}>
          <div className={styles.card}>
            <h1 className={styles.heading}>{heading}</h1>
            {children}
          </div>
        </main>
      </div>
    </Page>
  );
}
