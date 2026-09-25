import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled]):not([tabindex='-1'])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

type SiblingState = {
  element: HTMLElement;
  ariaHidden: string | null;
  wasInert: boolean;
};

/**
 * Gives Shorts drawers and dialogs consistent keyboard, focus and background
 * isolation without coupling their product state to a generic modal component.
 */
export function useShortsDialog<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    const parent = dialog.parentElement;
    const siblings: SiblingState[] = parent
      ? Array.from(parent.children)
        .filter((element): element is HTMLElement => (
          element instanceof HTMLElement && element !== dialog
        ))
        .map((element) => ({
          element,
          ariaHidden: element.getAttribute("aria-hidden"),
          wasInert: element.inert,
        }))
      : [];

    document.body.style.overflow = "hidden";
    for (const sibling of siblings) {
      sibling.element.inert = true;
      sibling.element.setAttribute("aria-hidden", "true");
    }

    const focusFrame = window.requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>(
        "[data-dialog-initial-focus], [autofocus], [contenteditable='true'], input:not([type='hidden'])",
      )?.focus({ preventScroll: true });
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) dialog.querySelector<HTMLElement>(
        "button:not([disabled]):not([tabindex='-1'])",
      )
        ?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.closest('[aria-hidden="true"]'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeIsFocusable = active instanceof HTMLElement && focusable.includes(active);
      if (event.shiftKey && (active === first || !activeIsFocusable)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activeIsFocusable)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      for (const sibling of siblings) {
        sibling.element.inert = sibling.wasInert;
        if (sibling.ariaHidden === null) {
          sibling.element.removeAttribute("aria-hidden");
        } else {
          sibling.element.setAttribute("aria-hidden", sibling.ariaHidden);
        }
      }
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  return dialogRef;
}
