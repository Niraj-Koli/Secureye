import { useEffect, useRef, useState } from "react";

export interface ChosenFile {
  file: File;
  /** Object URL for the preview. */
  preview: string;
}

/**
 * The file picked for upload, with a preview URL that is released when the file is replaced,
 * cleared or the page is left (the original created a new URL on every render and never
 * released them).
 */
export function useChosenFile() {
  const [chosen, setChosenState] = useState<ChosenFile | null>(null);
  const current = useRef<ChosenFile | null>(null);

  function set(next: ChosenFile | null) {
    if (current.current) URL.revokeObjectURL(current.current.preview);
    current.current = next;
    setChosenState(next);
  }

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current.preview);
    },
    [],
  );

  return {
    chosen,
    choose: (file: File) => {
      set({ file, preview: URL.createObjectURL(file) });
    },
    clear: () => {
      set(null);
    },
  };
}
