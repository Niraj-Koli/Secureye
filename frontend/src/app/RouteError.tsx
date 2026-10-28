import { isRouteErrorResponse, useRouteError } from "react-router";

import { MessageCard } from "@/shared/ui/MessageCard";
import { Page } from "@/shared/ui/Page";
import cardStyles from "@/shared/ui/Card.module.css";

import { NotFoundPage } from "./NotFoundPage";

/** Shown instead of a page that failed to load or crashed while rendering. */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);

  // A deploy replaces the hashed page bundles; a tab opened before it can't load the old ones.
  const staleBundle =
    error instanceof TypeError &&
    /dynamically imported module|importing a module script failed/i.test(error.message);

  return (
    <Page title="Error">
      <MessageCard heading="Something went wrong.">
        <p className={cardStyles.message}>
          {staleBundle
            ? "A new version of Secureye is available. Reload the page to continue."
            : "Please try again. If the problem continues, come back a little later."}
        </p>
      </MessageCard>
    </Page>
  );
}
