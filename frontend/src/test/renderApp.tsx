import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AppProviders } from "@/app/AppProviders";
import { routes } from "@/app/routes";

/** Render the whole app (real routes, providers and guards) at `path`. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

export function currentUrl(router: ReturnType<typeof renderApp>): string {
  const { pathname, search } = router.state.location;
  return pathname + search;
}
