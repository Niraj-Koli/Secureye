import { MessageCard } from "@/shared/ui/MessageCard";
import { Page } from "@/shared/ui/Page";

export function NotFoundPage() {
  return (
    <Page title="Not Found Page">
      <MessageCard heading="Oops! The page you are looking for doesn't exist." />
    </Page>
  );
}
