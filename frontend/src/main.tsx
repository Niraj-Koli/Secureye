import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { AppProviders } from "@/app/AppProviders";
import { createRouter } from "@/app/routes";

const container = document.getElementById("root");
if (container === null) throw new Error("index.html is missing the #root element");

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={createRouter()} />
    </AppProviders>
  </StrictMode>,
);
