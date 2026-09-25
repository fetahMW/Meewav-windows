import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShortsCreatorDrawer from "./ShortsCreatorDrawer";
import type { ShortsVideoItem } from "./shorts-wall-data";

const DRAFT_KEY = "meewav:shorts:draft";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

function renderCreator(overrides?: {
  onClose?: () => void;
  onNotify?: (message: string) => void;
  onPublish?: (item: ShortsVideoItem) => void;
}) {
  const onClose = overrides?.onClose ?? vi.fn<() => void>();
  const onNotify = overrides?.onNotify ?? vi.fn<(message: string) => void>();
  const onPublish = overrides?.onPublish ?? vi.fn<(item: ShortsVideoItem) => void>();

  render(
    <ShortsCreatorDrawer
      onClose={onClose}
      onNotify={onNotify}
      onPublish={onPublish}
    />,
  );

  return { onClose, onNotify, onPublish };
}

function CreatorHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir le Studio La Scène
      </button>
      {open ? (
        <ShortsCreatorDrawer
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          onNotify={vi.fn()}
          onPublish={vi.fn()}
        />
      ) : null}
    </div>
  );
}

describe("ShortsCreatorDrawer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("publishes a complete demo with a second camera, layout and publication metadata", async () => {
    const user = userEvent.setup();
    const { onNotify, onPublish } = renderCreator();

    await user.click(screen.getByRole("button", { name: /Tester avec une démo/i }));
    expect(onNotify).toHaveBeenCalledWith("Démo chargée. Le parcours de publication est prêt.");

    await user.click(screen.getByRole("button", { name: /Configurer le multi-cam/i }));
    expect(screen.getByRole("button", { name: /Multi-cam/i })).toHaveAttribute("aria-current", "step");

    await user.click(screen.getByRole("button", { name: /Utiliser la démo/i }));
    await user.click(screen.getByRole("button", { name: /^Duo/i }));
    expect(screen.getByRole("button", { name: /^Duo/i })).toHaveAttribute("aria-pressed", "true");
    expect(onNotify).toHaveBeenCalledWith("Caméra arrière de démonstration synchronisée.");

    await user.click(screen.getByRole("button", { name: /Préparer la publication/i }));
    expect(screen.getByRole("button", { current: "step" }))
      .toHaveTextContent("Publication");
    expect(screen.getByRole("button", { current: "step" }))
      .toHaveAttribute("aria-current", "step");

    const title = screen.getByRole("textbox", { name: /Titre de la vidéo/i });
    await user.clear(title);
    await user.type(title, "Session multi-caméra");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Type de contenu/i }),
      "Session",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Ta spécialité/i }),
      "Beatmaker · Producteur",
    );
    const city = screen.getByRole("textbox", { name: /Ville ou zone/i });
    await user.clear(city);
    await user.type(city, "Lyon");
    await user.type(
      screen.getByRole("textbox", { name: /Description/i }),
      "Une preuve de production conçue pour trouver une voix.",
    );

    await user.click(screen.getByRole("button", { name: /Vérifier les crédits/i }));
    expect(screen.getByRole("button", { current: "step" })).toHaveTextContent("Droits");
    await user.type(
      screen.getByRole("textbox", { name: /Collaborateurs/i }),
      "Alya Flow, Sacha Beat",
    );
    await user.click(screen.getByRole("checkbox", { name: /Droits musique confirmés/i }));
    await user.click(screen.getByRole("checkbox", { name: /Droits image confirmés/i }));
    await user.click(screen.getByRole("button", { name: /Publier la vidéo/i }));

    expect(onPublish).toHaveBeenCalledOnce();
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      title: "Session multi-caméra",
      artist: "Max",
      video: "/media/shorts-demo/portrait-studio-rap.mp4",
      format: "landscape",
      sourceFormat: "portrait",
      linkedDesktopVersion: true,
      secondaryVideo: "/media/shorts-demo/landscape-guitar.mp4",
      multicamLayout: "duo",
      role: "Beatmaker · Producteur",
      city: "Lyon",
      duration: "0:42",
      contentTypeLabel: "Session",
      description: "Une preuve de production conçue pour trouver une voix.",
      availability: "Disponible pour collaborer",
      meta: "Short + version 16:9 liés · Public",
      publicationGovernance: expect.objectContaining({
        validation: "local-preflight",
        requestedUses: ["sceneVod"],
        confirmations: {
          musicRights: true,
          imageRights: true,
        },
        credits: [
          expect.objectContaining({ displayName: "Max", role: "primaryArtist" }),
          expect.objectContaining({ displayName: "Alya Flow", role: "featuredArtist" }),
          expect.objectContaining({ displayName: "Sacha Beat", role: "featuredArtist" }),
        ],
      }),
    }));
  }, 15_000);

  it("saves and restores a draft before the media is reattached", async () => {
    const user = userEvent.setup();
    const firstNotify = vi.fn<(message: string) => void>();
    renderCreator({ onNotify: firstNotify });

    await user.click(screen.getByRole("button", { name: /Tester avec une démo/i }));
    await user.click(screen.getByRole("button", { name: /Configurer le multi-cam/i }));
    await user.click(screen.getByRole("button", { name: /Préparer la publication/i }));

    const title = screen.getByRole("textbox", { name: /Titre de la vidéo/i });
    await user.clear(title);
    await user.type(title, "Brouillon nocturne");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Type de contenu/i }),
      "DJ set",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Ta spécialité/i }),
      "DJ · Curateur",
    );
    const city = screen.getByRole("textbox", { name: /Ville ou zone/i });
    await user.clear(city);
    await user.type(city, "Marseille");
    await user.type(
      screen.getByRole("textbox", { name: /Description/i }),
      "Version de travail à reprendre demain.",
    );
    await user.click(screen.getByRole("button", { name: /Portfolio uniquement/i }));
    await user.click(screen.getByRole("checkbox", { name: /Disponible pour collaborer/i }));
    await user.click(screen.getByRole("button", { name: /Vérifier les crédits/i }));
    const collaborators = screen.getByRole("textbox", { name: /Collaborateurs/i });
    await user.type(collaborators, "Lina V.");
    await user.click(screen.getByRole("checkbox", { name: /Droits musique confirmés/i }));
    await user.click(screen.getByRole("checkbox", { name: /Droits image confirmés/i }));
    await user.click(screen.getByRole("checkbox", { name: /MeeWav TV · diffusion linéaire/i }));
    await user.click(screen.getByRole("button", { name: /Enregistrer le brouillon/i }));

    expect(firstNotify).toHaveBeenCalledWith("Brouillon enregistré sur cet appareil.");
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}")).toMatchObject({
      title: "Brouillon nocturne",
      description: "Version de travail à reprendre demain.",
      contentTypeLabel: "DJ set",
      role: "DJ · Curateur",
      city: "Marseille",
      available: false,
      visibility: "portfolio",
      multicamLayout: "rear",
      collaboratorsText: "Lina V.",
      musicRightsConfirmed: true,
      imageRightsConfirmed: true,
      sceneVodAllowed: true,
      tvLinearAllowed: true,
      clipGenerationAllowed: false,
    });

    cleanup();
    renderCreator();

    expect(await screen.findByRole("status")).toHaveTextContent("Brouillon restauré");
    await user.click(screen.getByRole("button", { name: /Tester avec une démo/i }));
    await user.click(screen.getByRole("button", { name: /Configurer le multi-cam/i }));
    await user.click(screen.getByRole("button", { name: /Préparer la publication/i }));

    expect(screen.getByRole("textbox", { name: /Titre de la vidéo/i }))
      .toHaveValue("Brouillon nocturne");
    expect(screen.getByRole("combobox", { name: /Type de contenu/i }))
      .toHaveValue("DJ set");
    expect(screen.getByRole("combobox", { name: /Ta spécialité/i }))
      .toHaveValue("DJ · Curateur");
    expect(screen.getByRole("textbox", { name: /Ville ou zone/i }))
      .toHaveValue("Marseille");
    expect(screen.getByRole("textbox", { name: /Description/i }))
      .toHaveValue("Version de travail à reprendre demain.");
    expect(screen.getByRole("button", { name: /Portfolio uniquement/i }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", { name: /Disponible pour collaborer/i }))
      .not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /Vérifier les crédits/i }));
    expect(screen.getByRole("textbox", { name: /Collaborateurs/i })).toHaveValue("Lina V.");
    expect(screen.getByRole("checkbox", { name: /Droits musique confirmés/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Droits image confirmés/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /MeeWav TV · diffusion linéaire/i }))
      .toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Génération d’extraits/i }))
      .not.toBeChecked();
  });

  it("keeps the native vertical video when the linked 16:9 version is disabled", async () => {
    const user = userEvent.setup();
    const { onPublish } = renderCreator();

    await user.click(screen.getByRole("button", { name: /Tester avec une démo/i }));
    await user.click(screen.getByRole("button", { name: /Configurer le multi-cam/i }));
    await user.click(screen.getByRole("checkbox", {
      name: /Lier le Short et la version 16:9/i,
    }));
    await user.click(screen.getByRole("button", { name: /Préparer la publication/i }));
    await user.click(screen.getByRole("button", { name: /Vérifier les crédits/i }));
    await user.click(screen.getByRole("checkbox", { name: /Droits musique confirmés/i }));
    await user.click(screen.getByRole("checkbox", { name: /Droits image confirmés/i }));
    await user.click(screen.getByRole("button", { name: /Publier la vidéo/i }));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      format: "portrait",
      sourceFormat: "portrait",
      linkedDesktopVersion: false,
      meta: "Short · Public",
    }));
  }, 15_000);

  it("keeps VOD, linear TV and clip generation explicit and independent", async () => {
    const user = userEvent.setup();
    const { onNotify, onPublish } = renderCreator();

    await user.click(screen.getByRole("button", { name: /Tester avec une démo/i }));
    await user.click(screen.getByRole("button", { name: /Configurer le multi-cam/i }));
    await user.click(screen.getByRole("button", { name: /Préparer la publication/i }));
    await user.click(screen.getByRole("button", { name: /Vérifier les crédits/i }));

    const vod = screen.getByRole("checkbox", { name: /La Scène VOD/i });
    const tv = screen.getByRole("checkbox", { name: /MeeWav TV · diffusion linéaire/i });
    const clips = screen.getByRole("checkbox", { name: /Génération d’extraits/i });
    expect(vod).toBeChecked();
    expect(tv).not.toBeChecked();
    expect(clips).not.toBeChecked();

    await user.click(tv);
    expect(tv).toBeChecked();
    expect(clips).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /Publier la vidéo/i }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenLastCalledWith(
      "Complète les crédits et confirme les droits avant de publier.",
    );

    await user.click(screen.getByRole("checkbox", { name: /Droits musique confirmés/i }));
    await user.click(screen.getByRole("checkbox", { name: /Droits image confirmés/i }));
    await user.click(vod);
    await user.click(screen.getByRole("button", { name: /Publier la vidéo/i }));
    expect(onPublish).not.toHaveBeenCalled();

    await user.click(vod);
    await user.click(screen.getByRole("button", { name: /Publier la vidéo/i }));
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      publicationGovernance: expect.objectContaining({
        requestedUses: ["sceneVod", "tvLinear"],
      }),
    }));
  });

  it("publishes an audio creation with a visualizer instead of a fake video workflow", async () => {
    const user = userEvent.setup();
    const { onNotify, onPublish } = renderCreator();
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio-demo");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await user.upload(
      screen.getByLabelText("Choisir une vidéo ou un audio"),
      new File(["audio-demo"], "minuit-sur-la-ville.mp3", { type: "audio/mpeg" }),
    );

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(onNotify).toHaveBeenCalledWith(
      "Audio prêt. Une pochette animée accompagnera la lecture.",
    );
    expect(screen.getByRole("button", { name: /Configurer le visualizer/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Short$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Configurer le visualizer/i }));
    expect(screen.getByText("La musique reste au premier plan")).toBeVisible();
    expect(screen.queryByText("Créer aussi une version 16:9")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Préparer la publication/i }));
    expect(screen.getByRole("textbox", { name: /Titre de la création audio/i }))
      .toHaveValue("Minuit Sur La Ville");
    await user.click(screen.getByRole("button", { name: /Vérifier les crédits/i }));
    await user.click(screen.getByRole("checkbox", { name: /Droits musique confirmés/i }));
    await user.click(screen.getByRole("checkbox", { name: /Droits image confirmés/i }));
    await user.click(screen.getByRole("button", { name: /Publier la création audio/i }));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      video: "blob:audio-demo",
      audioUrl: "blob:audio-demo",
      presentationFormat: "audio_visualizer",
      secondaryVideo: undefined,
      meta: "Création audio · visualizer · Public",
    }));
  });

  it("closes with Escape and restores focus to the Studio trigger", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreatorHarness onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "Ouvrir le Studio La Scène" });
    await user.click(trigger);

    const closeButton = screen.getByRole("button", { name: "Fermer" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
