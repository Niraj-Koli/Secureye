import type { ReactNode } from "react";

interface PageProps {
  /** Shown as "Secureye | <title>", like the original's tab titles. */
  title: string;
  children: ReactNode;
}

/** Sets the document title (React 19 hoists <title> into <head>). */
export function Page({ title, children }: PageProps) {
  return (
    <>
      <title>{`Secureye | ${title}`}</title>
      {children}
    </>
  );
}
