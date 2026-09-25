import {
  Gift,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
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
  isLocalAuthPreviewEnabled,
  isLocalDevHost,
} from "../../auth/localAuthPreview";
import {
  claimGlobeTreasure,
  getGlobeTreasureState,
} from "../api/globeTreasure.api";
import {
  mountHiddenFranceGiftLayer,
  type HiddenFranceGiftLayerController,
} from "../maplibre/hiddenFranceGiftLayer";

import "./HiddenFranceGift.css";

const PREVIEW_DISMISSED_STORAGE_KEY = "meewav:hidden-france-gift:preview-dismissed:v1";
const PREVIEW_FOCUS_QUERY_KEY = "hidden-gift-preview";
const LOCAL_LIVE_QUERY_KEY = "hidden-gift-live";
const HIDDEN_GIFT_SECRET_FOCUS_EVENT = "meewav:hidden-france-gift:secret-focus";
const HIDDEN_GIFT_SECRET_SEARCH_COMMANDS = new Set(["SHTATA", "SHTATA007"]);

export function isHiddenFranceGiftSearchCommand(value: string) {
  return HIDDEN_GIFT_SECRET_SEARCH_COMMANDS.has(
    value.trim().toLocaleUpperCase("fr-FR"),
  );
}

export function requestHiddenFranceGiftSecretFocus() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HIDDEN_GIFT_SECRET_FOCUS_EVENT));
}

type GiftDialog =
  | { kind: "winner"; rewardLabel: string | null }
  | { kind: "preview" }
  | { kind: "already-claimed" }
  | { kind: "unavailable" }
  | { kind: "authentication-required" }
  | { kind: "error" };

type HiddenFranceGiftProps = {
  map: MapLibreMap | null;
  ownerProfileId: string | null;
  focusReady?: boolean;
};

function isPreviewAlreadyDismissed() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(PREVIEW_DISMISSED_STORAGE_KEY) === "true";
}

function isLocalGiftReviewEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  const isLocalHost = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
  return isLocalHost
    && new URLSearchParams(window.location.search).get(PREVIEW_FOCUS_QUERY_KEY) === "1";
}

/**
 * Keep the treasure testable on the normal local Globe, even when the local
 * Supabase credentials are intentionally absent. Production still relies
 * exclusively on the atomic campaign state. `hidden-gift-live=1` remains an
 * explicit escape hatch for developers who need to exercise that live path.
 */
export function shouldEnableLocalGiftDevelopmentPreview(input: {
  dev: boolean;
  mode: string;
  hostname: string;
  forceLive: boolean;
}) {
  return input.dev
    && input.mode !== "test"
    && isLocalDevHost(input.hostname)
    && !input.forceLive;
}

function isLocalGiftDevelopmentPreviewEnabled() {
  if (typeof window === "undefined") return false;
  const searchParams = new URLSearchParams(window.location.search);

  return shouldEnableLocalGiftDevelopmentPreview({
    dev: import.meta.env.DEV,
    mode: import.meta.env.MODE,
    hostname: window.location.hostname,
    forceLive: searchParams.get(LOCAL_LIVE_QUERY_KEY) === "1",
  });
}

function describeClaimError(
  error: unknown,
): "authentication-required" | "error" {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("auth")
    || message.includes("jwt")
    || message.includes("session")
    || message.includes("401")
  ) {
    return "authentication-required";
  }
  return "error";
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>([
    "button:not([disabled])",
    "[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(","))).filter((element) => !element.hasAttribute("hidden"));
}

function TreasureDialog({
  dialog,
  dismissing,
  onConfirm,
  onClose,
  onRetry,
}: {
  dialog: GiftDialog;
  dismissing: boolean;
  onConfirm: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const isDiscovery = dialog.kind === "winner" || dialog.kind === "preview";
  const canClose = !isDiscovery && !dismissing;

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
      if (canClose) onClose();
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

  const content = (() => {
    if (dialog.kind === "winner") {
      return {
        eyebrow: "TRÉSOR SECRET · TROUVÉ",
        title: "Le signal t’a choisi.",
        description: "Tu viens de retrouver le cadeau secret caché en France. Ta récompense est réservée à ton profil ; l’équipe Meewav te contactera pour la suite.",
        action: "Valider ma découverte",
        icon: <Trophy aria-hidden="true" />,
      };
    }
    if (dialog.kind === "preview") {
      return {
        eyebrow: "APERÇU LOCAL · DÉMONSTRATION",
        title: "Tu as trouvé le cadeau secret.",
        description: "Cette animation est une démonstration locale. Aucune récompense réelle n’est réservée dans cet aperçu.",
        action: "Terminer l’aperçu",
        icon: <Gift aria-hidden="true" />,
      };
    }
    if (dialog.kind === "already-claimed") {
      return {
        eyebrow: "SIGNAL TERMINÉ",
        title: "Le cadeau vient d’être trouvé.",
        description: "Un autre explorateur a validé sa découverte juste avant toi. Cette chasse est désormais terminée.",
        action: "Compris",
        icon: <Sparkles aria-hidden="true" />,
      };
    }
    if (dialog.kind === "unavailable") {
      return {
        eyebrow: "CHASSE TERMINÉE",
        title: "Ce signal n’est plus actif.",
        description: "Le cadeau ne peut plus être réclamé. Une prochaine chasse apparaîtra peut-être ailleurs sur le Globe.",
        action: "Fermer",
        icon: <Sparkles aria-hidden="true" />,
      };
    }
    if (dialog.kind === "authentication-required") {
      return {
        eyebrow: "VALIDATION SÉCURISÉE",
        title: "Ton profil doit être connecté.",
        description: "Le cadeau est toujours là. Connecte ton profil Meewav avant de tenter à nouveau de réserver la récompense.",
        action: "Réessayer",
        icon: <LockKeyhole aria-hidden="true" />,
      };
    }
    return {
      eyebrow: "SIGNAL INTERROMPU",
      title: "Le cadeau est toujours là.",
      description: "La validation réseau n’a pas abouti. Rien n’a été réclamé : tu peux relancer la vérification sans perdre ta découverte.",
      action: "Réessayer",
      icon: <ShieldCheck aria-hidden="true" />,
    };
  })();

  const retryable = dialog.kind === "error" || dialog.kind === "authentication-required";
  const buttonAction = isDiscovery ? onConfirm : retryable ? onRetry : onClose;

  return createPortal(
    <div
      className={`mw-hidden-gift-modal ${dismissing ? "is-dismissing" : ""}`}
      data-tone={dialog.kind}
      role="presentation"
    >
      <div className="mw-hidden-gift-modal__backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="mw-hidden-gift-modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mw-hidden-gift-title"
        aria-describedby="mw-hidden-gift-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="mw-hidden-gift-modal__aurora" aria-hidden="true" />
        <div className="mw-hidden-gift-modal__particles" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
        </div>

        {canClose && (
          <button
            type="button"
            className="mw-hidden-gift-modal__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X aria-hidden="true" />
          </button>
        )}

        <div className="mw-hidden-gift-modal__emblem" aria-hidden="true">
          <span>{content.icon}</span>
          <i />
        </div>

        <div className="mw-hidden-gift-modal__copy">
          <p className="mw-hidden-gift-modal__eyebrow">
            <Sparkles aria-hidden="true" />
            {content.eyebrow}
          </p>
          <h2 id="mw-hidden-gift-title">{content.title}</h2>
          <p id="mw-hidden-gift-description">{content.description}</p>
          {dialog.kind === "winner" && dialog.rewardLabel && (
            <div className="mw-hidden-gift-modal__reward" aria-label={`Récompense : ${dialog.rewardLabel}`}>
              <Gift aria-hidden="true" />
              <span>
                <small>RÉCOMPENSE RÉSERVÉE</small>
                <strong>{dialog.rewardLabel}</strong>
              </span>
              <ShieldCheck aria-hidden="true" />
            </div>
          )}
          {dialog.kind === "preview" && (
            <div className="mw-hidden-gift-modal__preview-note">
              <ShieldCheck aria-hidden="true" />
              Mode test — aucune attribution Supabase
            </div>
          )}
        </div>

        <footer className="mw-hidden-gift-modal__footer">
          {retryable && (
            <button type="button" className="mw-hidden-gift-modal__secondary" onClick={onClose}>
              Fermer
            </button>
          )}
          <button
            ref={primaryActionRef}
            type="button"
            className="mw-hidden-gift-modal__primary"
            onClick={buttonAction}
            disabled={dismissing}
          >
            {dismissing ? (
              <>
                <LoaderCircle className="mw-hidden-gift-is-spinning" aria-hidden="true" />
                Validation…
              </>
            ) : (
              <>
                {isDiscovery ? <Sparkles aria-hidden="true" /> : null}
                {content.action}
              </>
            )}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default function HiddenFranceGift({
  map,
  ownerProfileId,
  focusReady = true,
}: HiddenFranceGiftProps) {
  const controllerRef = useRef<HiddenFranceGiftLayerController | null>(null);
  const activateRef = useRef<() => void>(() => undefined);
  const focusedForReviewRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const previewEnabledRef = useRef(false);

  const [dialog, setDialog] = useState<GiftDialog | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [giftVisible, setGiftVisible] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setLayerVisibility = useCallback((visible: boolean, interactive = visible) => {
    controllerRef.current?.setVisible(visible);
    controllerRef.current?.setInteractive(interactive);
    setGiftVisible(visible);
  }, []);

  const activateGift = useCallback(async () => {
    if (claiming || dismissing || dialog) return;
    const controller = controllerRef.current;
    if (!controller) return;

    if (previewEnabledRef.current) {
      controller.setInteractive(false);
      void controller.celebrate();
      setDialog({ kind: "preview" });
      return;
    }

    if (!ownerProfileId) {
      controller.resetPulse();
      controller.setInteractive(false);
      setDialog({ kind: "authentication-required" });
      return;
    }

    const requestSequence = ++requestSequenceRef.current;
    setClaiming(true);
    controller.setInteractive(false);

    try {
      const result = await claimGlobeTreasure();
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;

      if (result.outcome === "won_by_you") {
        void controller.celebrate();
        setDialog({ kind: "winner", rewardLabel: result.rewardLabel });
      } else if (result.outcome === "already_claimed") {
        controller.hideImmediately();
        setGiftVisible(false);
        setDialog({ kind: "already-claimed" });
      } else {
        controller.hideImmediately();
        setGiftVisible(false);
        setDialog({ kind: "unavailable" });
      }
    } catch (error) {
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      controller.resetPulse();
      controller.setInteractive(false);
      setDialog({ kind: describeClaimError(error) });
    } finally {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) setClaiming(false);
    }
  }, [claiming, dialog, dismissing, ownerProfileId]);

  activateRef.current = () => {
    void activateGift();
  };

  useEffect(() => {
    if (!map) return;
    const controller = mountHiddenFranceGiftLayer(map, {
      initiallyVisible: false,
      initiallyInteractive: false,
      onActivate: () => activateRef.current(),
    });
    controllerRef.current = controller;
    if (isLocalGiftReviewEnabled()) {
      const reviewWindow = window as Window & {
        __MEEWAV_HIDDEN_GIFT_CONTROLLER__?: HiddenFranceGiftLayerController;
        __MEEWAV_HIDDEN_GIFT_MAP__?: MapLibreMap;
      };
      reviewWindow.__MEEWAV_HIDDEN_GIFT_CONTROLLER__ = controller;
      reviewWindow.__MEEWAV_HIDDEN_GIFT_MAP__ = map;
    }

    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      const reviewWindow = window as Window & {
        __MEEWAV_HIDDEN_GIFT_CONTROLLER__?: HiddenFranceGiftLayerController;
        __MEEWAV_HIDDEN_GIFT_MAP__?: MapLibreMap;
      };
      if (reviewWindow.__MEEWAV_HIDDEN_GIFT_CONTROLLER__ === controller) {
        delete reviewWindow.__MEEWAV_HIDDEN_GIFT_CONTROLLER__;
        delete reviewWindow.__MEEWAV_HIDDEN_GIFT_MAP__;
      }
      controller.remove();
    };
  }, [map]);

  useEffect(() => {
    const handleSecretFocus = () => {
      if (previewEnabledRef.current) {
        window.sessionStorage.removeItem(PREVIEW_DISMISSED_STORAGE_KEY);
        setLayerVisibility(true, true);
      }
      controllerRef.current?.focusFromSecretSearch();
    };
    window.addEventListener(HIDDEN_GIFT_SECRET_FOCUS_EVENT, handleSecretFocus);
    return () => window.removeEventListener(HIDDEN_GIFT_SECRET_FOCUS_EVENT, handleSecretFocus);
  }, [setLayerVisibility]);

  useEffect(() => {
    if (!map || !controllerRef.current) return;
    let cancelled = false;
    const sequence = ++requestSequenceRef.current;
    const reviewPreviewEnabled = isLocalGiftReviewEnabled();
    const previewEnabled = isLocalAuthPreviewEnabled()
      || reviewPreviewEnabled
      || isLocalGiftDevelopmentPreviewEnabled();
    previewEnabledRef.current = previewEnabled;

    if (previewEnabled) {
      // The ordinary local Globe is a repeatable product preview: a previous
      // click must not make the gift disappear on the next reload. The
      // explicit visual-review route keeps its persisted dismissal contract.
      const visible = reviewPreviewEnabled ? !isPreviewAlreadyDismissed() : true;
      setLayerVisibility(visible);
      return;
    }

    setLayerVisibility(false, false);
    void getGlobeTreasureState()
      .then((result) => {
        if (cancelled || sequence !== requestSequenceRef.current) return;
        setLayerVisibility(result.ok && result.available && !result.claimed);
      })
      .catch(() => {
        if (cancelled || sequence !== requestSequenceRef.current) return;
        // Fail closed: a state outage must never expose a reward whose global
        // claim status cannot be verified.
        setLayerVisibility(false, false);
      });

    return () => {
      cancelled = true;
    };
  }, [map, ownerProfileId, setLayerVisibility]);

  useEffect(() => {
    if (
      !focusReady
      || !giftVisible
      || focusedForReviewRef.current
      || !isLocalGiftReviewEnabled()
    ) return;

    focusedForReviewRef.current = true;
    controllerRef.current?.focusForPreview();
  }, [focusReady, giftVisible]);

  const closeDialog = useCallback(() => {
    if (dismissing) return;
    setDialog(null);
    controllerRef.current?.resetPulse();
    controllerRef.current?.setInteractive(giftVisible);
  }, [dismissing, giftVisible]);

  const retryClaim = useCallback(() => {
    setDialog(null);
    controllerRef.current?.setInteractive(true);
    window.requestAnimationFrame(() => activateRef.current());
  }, []);

  const confirmDiscovery = useCallback(async () => {
    if (!dialog || (dialog.kind !== "winner" && dialog.kind !== "preview") || dismissing) return;

    setDismissing(true);
    controllerRef.current?.setInteractive(false);
    try {
      await controllerRef.current?.dismiss();
      if (dialog.kind === "preview" && isLocalGiftReviewEnabled()) {
        window.sessionStorage.setItem(PREVIEW_DISMISSED_STORAGE_KEY, "true");
      }
      setGiftVisible(false);
      setDialog(null);
    } finally {
      if (mountedRef.current) setDismissing(false);
    }
  }, [dialog, dismissing]);

  return (
    <>
      {claiming && (
        <div className="mw-hidden-gift-claiming" role="status" aria-live="polite">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Découverte détectée</strong>
            Vérification sécurisée en cours…
          </span>
          <LoaderCircle className="mw-hidden-gift-is-spinning" aria-hidden="true" />
        </div>
      )}
      {dialog && (
        <TreasureDialog
          dialog={dialog}
          dismissing={dismissing}
          onConfirm={() => void confirmDiscovery()}
          onClose={closeDialog}
          onRetry={retryClaim}
        />
      )}
    </>
  );
}

export type { HiddenFranceGiftProps };
