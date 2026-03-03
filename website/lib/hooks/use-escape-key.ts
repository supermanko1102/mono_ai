import { useEffect } from "react";

export function useEscapeKey(options: {
  enabled: boolean;
  onEscape: () => void;
}) {
  const { enabled, onEscape } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onEscape]);
}
