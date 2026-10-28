import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/shared/api/errors";
import { useSession } from "@/shared/auth/store";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network and server errors, never a 4xx: asking again won't change the answer.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ApiError && error.status < 500),
    },
  },
});

// One user's cached data must never be shown to the next person who signs in on this browser.
useSession.subscribe((state, previous) => {
  if (previous.status === "authenticated" && state.status !== "authenticated") {
    queryClient.clear();
  }
});
