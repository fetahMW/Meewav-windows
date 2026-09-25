import {
  LoaderCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Map as MapLibreMap } from "maplibre-gl";

import {
  mountHiddenFranceIphonePrizeLayer,
  type HiddenFranceIphonePrizeLayerController,
} from "../maplibre/hiddenFranceGiftLayer";

import "./HiddenFranceGift.css";

const HIDDEN_IPHONE_SECRET_FOCUS_EVENT = "meewav:hidden-france-iphone:secret-focus";
const HIDDEN_IPHONE_SECRET_SEARCH_COMMAND = "SHTATA000";

export function isHiddenFranceIphoneSearchCommand(value: string) {
  return value.trim().toLocaleUpperCase("fr-FR") === HIDDEN_IPHONE_SECRET_SEARCH_COMMAND;
}

export function requestHiddenFranceIphoneSecretFocus() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HIDDEN_IPHONE_SECRET_FOCUS_EVENT));
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>([
    "button:not([disabled])",
    "[href]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(","))).filter((element) => !element.hasAttribute("hidden"));
}

function IphonePrizeDialog({
  dismissing,
  onConfirm,
  onClose,
}: {
  dismissing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => primaryActionRef.current?.focus({ preventScroll: true }));

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      if (!dismissing) onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={`mw-hidden-gift-modal ${dismissing ? "is-dismissing" : ""}`}
      data-tone="winner"
      role="presentation"
    >
      <div className="mw-hidden-gift-modal__backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="mw-hidden-gift-modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mw-hidden-iphone-title"
        aria-describedby="mw-hidden-iphone-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="mw-hidden-gift-modal__aurora" aria-hidden="true" />
        <div className="mw-hidden-gift-modal__particles" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
        </div>
        <button
          type="button"
          className="mw-hidden-gift-modal__close"
          onClick={onClose}
          disabled={dismissing}
          aria-label="Fermer"
        >
          <X aria-hidden="true" />
        </button>

        <div className="mw-hidden-gift-modal__emblem" aria-hidden="true">
          <span><Trophy /></span>
          <i />
        </div>

        <div className="mw-hidden-gift-modal__copy">
          <p className="mw-hidden-gift-modal__eyebrow">
            <Sparkles aria-hidden="true" />
            TRÉSOR SECRET · IPHONE TROUVÉ
          </p>
          <h2 id="mw-hidden-iphone-title">
            Félicitations, vous venez de gagner l’iPhone 16.
          </h2>
          <p id="mw-hidden-iphone-description">
            Vous avez retrouvé le modèle caché sur le Globe. Votre découverte est validée ; l’équipe MeeWav vous contactera pour la remise du prix.
          </p>
          <div className="mw-hidden-gift-modal__reward" aria-label="Récompense : iPhone 16">
            <Smartphone aria-hidden="true" />
            <span>
              <small>RÉCOMPENSE DÉCOUVERTE</small>
              <strong>iPhone 16</strong>
            </span>
            <ShieldCheck aria-hidden="true" />
          </div>
        </div>

        <footer className="mw-hidden-gift-modal__footer">
          <button
            ref={primaryActionRef}
            type="button"
            className="mw-hidden-gift-modal__primary"
            onClick={onConfirm}
            disabled={dismissing}
          >
            {dismissing ? (
              <>
                <LoaderCircle className="mw-hidden-gift-is-spinning" aria-hidden="true" />
                Validation…
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" />
                Valider ma découverte
              </>
            )}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default function HiddenFranceIphonePrize({
  map,
}: {
  map: MapLibreMap | null;
}) {
  const controllerRef = useRef<HiddenFranceIphonePrizeLayerController | null>(null);
  const activateRef = useRef<() => void>(() => undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const activatePrize = useCallback(() => {
    if (dialogOpen || dismissing) return;
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setInteractive(false);
    void controller.celebrate();
    setDialogOpen(true);
  }, [dialogOpen, dismissing]);

  activateRef.current = activatePrize;

  useEffect(() => {
    if (!map) return;
    const controller = mountHiddenFranceIphonePrizeLayer(map, {
      initiallyVisible: true,
      initiallyInteractive: true,
      onActivate: () => activateRef.current(),
    });
    controllerRef.current = controller;

    if (import.meta.env.DEV) {
      const reviewWindow = window as Window & {
        __MEEWAV_HIDDEN_IPHONE_CONTROLLER__?: HiddenFranceIphonePrizeLayerController;
        __MEEWAV_HIDDEN_IPHONE_MAP__?: MapLibreMap;
      };
      reviewWindow.__MEEWAV_HIDDEN_IPHONE_CONTROLLER__ = controller;
      reviewWindow.__MEEWAV_HIDDEN_IPHONE_MAP__ = map;
    }

    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      const reviewWindow = window as Window & {
        __MEEWAV_HIDDEN_IPHONE_CONTROLLER__?: HiddenFranceIphonePrizeLayerController;
        __MEEWAV_HIDDEN_IPHONE_MAP__?: MapLibreMap;
      };
      if (reviewWindow.__MEEWAV_HIDDEN_IPHONE_CONTROLLER__ === controller) {
        delete reviewWindow.__MEEWAV_HIDDEN_IPHONE_CONTROLLER__;
        delete reviewWindow.__MEEWAV_HIDDEN_IPHONE_MAP__;
      }
      controller.remove();
    };
  }, [map]);

  useEffect(() => {
    const handleSecretFocus = () => {
      const controller = controllerRef.current;
      if (!controller) return;
      controller.setVisible(true);
      controller.setInteractive(true);
      controller.focusFromSecretSearch();
    };
    window.addEventListener(HIDDEN_IPHONE_SECRET_FOCUS_EVENT, handleSecretFocus);
    return () => window.removeEventListener(HIDDEN_IPHONE_SECRET_FOCUS_EVENT, handleSecretFocus);
  }, []);

  const closeDialog = useCallback(() => {
    if (dismissing) return;
    setDialogOpen(false);
    controllerRef.current?.resetPulse();
    controllerRef.current?.setInteractive(true);
  }, [dismissing]);

  const confirmDiscovery = useCallback(async () => {
    if (dismissing) return;
    setDismissing(true);
    controllerRef.current?.setInteractive(false);
    try {
      await controllerRef.current?.dismiss();
      setDialogOpen(false);
    } finally {
      setDismissing(false);
    }
  }, [dismissing]);

  return dialogOpen ? (
    <IphonePrizeDialog
      dismissing={dismissing}
      onConfirm={() => void confirmDiscovery()}
      onClose={closeDialog}
    />
  ) : null;
}
