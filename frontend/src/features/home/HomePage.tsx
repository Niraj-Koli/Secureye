import banner from "@/assets/images/banner.webp";
import { Footer } from "@/shared/ui/Footer";
import { Page } from "@/shared/ui/Page";
import { SiteHeader } from "@/shared/ui/SiteHeader";

import { About } from "./About";
import { CompareSlider } from "./CompareSlider";
import styles from "./Home.module.css";
import { ToolCards } from "./ToolCards";

export default function HomePage() {
  return (
    <Page title="Home Page">
      <SiteHeader variant="banner" />
      <main>
        {/* The original's full-screen banner photo; the heading is for screen readers and search. */}
        <div className={styles.hero}>
          <h1 className={styles.visuallyHidden}>
            Secureye: threat detection for military security
          </h1>
          <img src={banner} alt="" fetchPriority="high" className={styles.heroImage} />
        </div>
        <ToolCards />
        <CompareSlider />
        <About />
      </main>
      <Footer />
    </Page>
  );
}
