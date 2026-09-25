import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  FileVideo2,
  Film,
  Hash,
  Image,
  Link2,
  Monitor,
  MonitorPlay,
  Music2,
  Save,
  Scissors,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Upload,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { MediaDistributionUse } from "../scene/mediaGovernance";
import { useAuth } from "../auth/AuthContext";
import { profileMediaRepository } from "../profile/profile.media.service";
import type {
  ShortsContentTypeLabel,
  ShortsMulticamLayout,
  ShortsVideoFormat,
  ShortsVideoItem,
} from "./shorts-wall-data";
import { validateShortsCreatorGovernance } from "./shortsCreatorGovernance";
import { useShortsDialog } from "./useShortsDialog";

type CreatorStep = 1 | 2 | 3 | 4;

type CreatorMedia = {
  name: string;
  sizeLabel: string;
  url: string;
  isObjectUrl: boolean;
  kind: "video" | "audio";
  durationLabel?: string;
  file?: File;
};

type ShortsCreatorDrawerProps = {
  onClose: () => void;
  onNotify: (message: string) => void;
  onPublish: (item: ShortsVideoItem) => void;
};

const MULTICAM_LAYOUTS: Array<{
  id: ShortsMulticamLayout;
  label: string;
  detail: string;
}> = [
  { id: "pip", label: "Incrustation", detail: "Caméra secondaire en vignette" },
  { id: "duo", label: "Duo", detail: "Deux angles côte à côte" },
  { id: "instrument", label: "Artiste + instrument", detail: "Le geste musical reste visible" },
  { id: "rear", label: "Caméra arrière", detail: "La scène complète en plan large" },
];

const CREATOR_ROLES = [
  "Artiste · Interprète",
  "Rappeur · Auteur",
  "Chanteuse · Topliner",
  "Beatmaker · Producteur",
  "DJ · Curateur",
  "Danseur · Chorégraphe",
  "Instrumentiste · Compositeur",
] as const;

const CREATOR_CONTENT_TYPES = [
  "Clip",
  "Performance",
  "Session",
  "DJ set",
  "Freestyle",
  "Danse",
  "Cover",
  "Studio",
  "Coulisses",
  "Interview",
  "Documentaire",
  "Collaboration",
] as const satisfies readonly ShortsContentTypeLabel[];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase("fr"));
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const seconds = Math.round(value);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function ShortsCreatorDrawer({
  onClose,
  onNotify,
  onPublish,
}: ShortsCreatorDrawerProps) {
  const { user } = useAuth();
  const dialogRef = useShortsDialog<HTMLDivElement>(true, onClose);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const secondaryFileInputRef = useRef<HTMLInputElement>(null);
  const ownedObjectUrlRef = useRef<string | null>(null);
  const ownedSecondaryObjectUrlRef = useRef<string | null>(null);
  const transferredObjectUrlRef = useRef<string | null>(null);
  const transferredSecondaryUrlRef = useRef<string | null>(null);
  const publishingRef = useRef(false);
  const [step, setStep] = useState<CreatorStep>(1);
  const [media, setMedia] = useState<CreatorMedia | null>(null);
  const [secondaryMedia, setSecondaryMedia] = useState<CreatorMedia | null>(null);
  const [format, setFormat] = useState<ShortsVideoFormat>("portrait");
  const [isDragging, setIsDragging] = useState(false);
  const [multicamEnabled, setMulticamEnabled] = useState(true);
  const [multicamLayout, setMulticamLayout] = useState<ShortsMulticamLayout>("rear");
  const [desktopVersion, setDesktopVersion] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentTypeLabel, setContentTypeLabel] = useState<ShortsContentTypeLabel>("Performance");
  const [role, setRole] = useState<(typeof CREATOR_ROLES)[number]>(CREATOR_ROLES[0]);
  const [city, setCity] = useState("Paris");
  const [available, setAvailable] = useState(true);
  const [visibility, setVisibility] = useState<"public" | "portfolio">("public");
  const [primaryArtistName, setPrimaryArtistName] = useState("Max");
  const [collaboratorsText, setCollaboratorsText] = useState("");
  const [publicationLinks, setPublicationLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [associatedType, setAssociatedType] = useState<"none" | "track" | "project" | "room">("none");
  const [associatedLabel, setAssociatedLabel] = useState("");
  const [associatedUrl, setAssociatedUrl] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [musicRightsConfirmed, setMusicRightsConfirmed] = useState(false);
  const [imageRightsConfirmed, setImageRightsConfirmed] = useState(false);
  const [sceneVodAllowed, setSceneVodAllowed] = useState(true);
  const [tvLinearAllowed, setTvLinearAllowed] = useState(false);
  const [clipGenerationAllowed, setClipGenerationAllowed] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const outputFormat: ShortsVideoFormat = desktopVersion ? "landscape" : format;
  const creatorAssetId = `scene-upload:${media?.name ?? "pending"}`;
  const requestedUses: MediaDistributionUse[] = [
    ...(sceneVodAllowed ? ["sceneVod" as const] : []),
    ...(tvLinearAllowed ? ["tvLinear" as const] : []),
    ...(clipGenerationAllowed ? ["clipGeneration" as const] : []),
  ];
  const governancePreflight = validateShortsCreatorGovernance({
    assetId: creatorAssetId,
    primaryArtistName,
    collaboratorsText,
    musicRightsConfirmed,
    imageRightsConfirmed,
    requestedUses,
  });
  const isAudioCreation = media?.kind === "audio";

  useEffect(() => () => {
    const ownedUrl = ownedObjectUrlRef.current;
    if (ownedUrl && ownedUrl !== transferredObjectUrlRef.current) {
      URL.revokeObjectURL(ownedUrl);
    }
    const ownedSecondaryUrl = ownedSecondaryObjectUrlRef.current;
    if (ownedSecondaryUrl && ownedSecondaryUrl !== transferredSecondaryUrlRef.current) {
      URL.revokeObjectURL(ownedSecondaryUrl);
    }
  }, []);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem("meewav:shorts:draft");
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft) as Partial<{
        format: ShortsVideoFormat;
        multicamEnabled: boolean;
        multicamLayout: ShortsMulticamLayout;
        desktopVersion: boolean;
        title: string;
        description: string;
        contentTypeLabel: ShortsContentTypeLabel;
        role: (typeof CREATOR_ROLES)[number];
        city: string;
        available: boolean;
        visibility: "public" | "portfolio";
        primaryArtistName: string;
        collaboratorsText: string;
        publicationLinks: Array<{ label: string; url: string }>;
        associatedType: "none" | "track" | "project" | "room";
        associatedLabel: string;
        associatedUrl: string;
        hashtagsText: string;
        musicRightsConfirmed: boolean;
        imageRightsConfirmed: boolean;
        sceneVodAllowed: boolean;
        tvLinearAllowed: boolean;
        clipGenerationAllowed: boolean;
      }>;
      if (draft.format === "portrait" || draft.format === "landscape") setFormat(draft.format);
      if (typeof draft.multicamEnabled === "boolean") setMulticamEnabled(draft.multicamEnabled);
      if (draft.multicamLayout && MULTICAM_LAYOUTS.some(({ id }) => id === draft.multicamLayout)) {
        setMulticamLayout(draft.multicamLayout);
      }
      if (typeof draft.desktopVersion === "boolean") setDesktopVersion(draft.desktopVersion);
      if (typeof draft.title === "string") setTitle(draft.title);
      if (typeof draft.description === "string") setDescription(draft.description);
      if (draft.contentTypeLabel && CREATOR_CONTENT_TYPES.includes(
        draft.contentTypeLabel as (typeof CREATOR_CONTENT_TYPES)[number],
      )) {
        setContentTypeLabel(draft.contentTypeLabel);
      }
      if (draft.role && CREATOR_ROLES.includes(draft.role)) setRole(draft.role);
      if (typeof draft.city === "string") setCity(draft.city);
      if (typeof draft.available === "boolean") setAvailable(draft.available);
      if (draft.visibility === "public" || draft.visibility === "portfolio") {
        setVisibility(draft.visibility);
      }
      if (typeof draft.primaryArtistName === "string") {
        setPrimaryArtistName(draft.primaryArtistName);
      }
      if (typeof draft.collaboratorsText === "string") {
        setCollaboratorsText(draft.collaboratorsText);
      }
      if (Array.isArray(draft.publicationLinks)) setPublicationLinks(draft.publicationLinks.filter((link) => typeof link?.label === "string" && typeof link?.url === "string").slice(0, 6));
      if (draft.associatedType && ["none", "track", "project", "room"].includes(draft.associatedType)) setAssociatedType(draft.associatedType);
      if (typeof draft.associatedLabel === "string") setAssociatedLabel(draft.associatedLabel);
      if (typeof draft.associatedUrl === "string") setAssociatedUrl(draft.associatedUrl);
      if (typeof draft.hashtagsText === "string") setHashtagsText(draft.hashtagsText);
      if (typeof draft.musicRightsConfirmed === "boolean") {
        setMusicRightsConfirmed(draft.musicRightsConfirmed);
      }
      if (typeof draft.imageRightsConfirmed === "boolean") {
        setImageRightsConfirmed(draft.imageRightsConfirmed);
      }
      if (typeof draft.sceneVodAllowed === "boolean") setSceneVodAllowed(draft.sceneVodAllowed);
      if (typeof draft.tvLinearAllowed === "boolean") setTvLinearAllowed(draft.tvLinearAllowed);
      if (typeof draft.clipGenerationAllowed === "boolean") {
        setClipGenerationAllowed(draft.clipGenerationAllowed);
      }
      setDraftRestored(true);
    } catch {
      window.localStorage.removeItem("meewav:shorts:draft");
    }
  }, []);

  const clearOwnedUrl = () => {
    if (ownedObjectUrlRef.current) {
      URL.revokeObjectURL(ownedObjectUrlRef.current);
      ownedObjectUrlRef.current = null;
    }
  };

  const clearOwnedSecondaryUrl = () => {
    if (ownedSecondaryObjectUrlRef.current) {
      URL.revokeObjectURL(ownedSecondaryObjectUrlRef.current);
      ownedSecondaryObjectUrlRef.current = null;
    }
  };

  const acceptFile = (file: File) => {
    const kind = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : null;
    if (!kind) {
      onNotify("Choisis un fichier vidéo ou audio pour créer une publication.");
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      onNotify("Ce média dépasse la limite actuelle de 250 Mo.");
      return;
    }

    clearOwnedUrl();
    const url = URL.createObjectURL(file);
    ownedObjectUrlRef.current = url;
    setMedia({
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      url,
      isObjectUrl: true,
      kind,
      file,
    });
    if (kind === "audio") {
      setFormat("landscape");
      setDesktopVersion(true);
      setMulticamEnabled(false);
      clearOwnedSecondaryUrl();
      setSecondaryMedia(null);
    }
    if (!title.trim()) setTitle(titleFromFileName(file.name));
    onNotify(kind === "audio"
      ? "Audio prêt. Une pochette animée accompagnera la lecture."
      : "Vidéo prête. Vérifie maintenant son format.");
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) acceptFile(file);
    event.currentTarget.value = "";
  };

  const acceptSecondaryFile = (file: File) => {
    if (!file.type.startsWith("video/")) {
      onNotify("La seconde caméra doit aussi être un fichier vidéo.");
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      onNotify("La seconde vidéo dépasse la limite actuelle de 250 Mo.");
      return;
    }
    clearOwnedSecondaryUrl();
    const url = URL.createObjectURL(file);
    ownedSecondaryObjectUrlRef.current = url;
    setSecondaryMedia({
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      url,
      isObjectUrl: true,
      kind: "video",
    });
    onNotify("Seconde caméra ajoutée au montage multi-écran.");
  };

  const onSecondaryFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) acceptSecondaryFile(file);
    event.currentTarget.value = "";
  };

  const useSecondaryDemo = () => {
    clearOwnedSecondaryUrl();
    setSecondaryMedia({
      name: "Caméra arrière de démonstration",
      sizeLabel: "Source secondaire",
      url: "/media/shorts-demo/landscape-guitar.mp4",
      isObjectUrl: false,
      kind: "video",
    });
    onNotify("Caméra arrière de démonstration synchronisée.");
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const useDemo = () => {
    clearOwnedUrl();
    const isPortrait = format === "portrait";
    const demo = isPortrait
      ? "/media/shorts-demo/portrait-studio-rap.mp4"
      : "/media/shorts-demo/landscape-dj.mp4";
    setMedia({
      name: isPortrait ? "Démo Short MeeWav" : "Démo horizontale MeeWav",
      sizeLabel: "Vidéo de démonstration",
      url: demo,
      isObjectUrl: false,
      kind: "video",
      durationLabel: isPortrait ? "0:42" : "2:36",
    });
    if (!title.trim()) setTitle(isPortrait ? "Mon Short" : "Ma vidéo 16:9");
    onNotify("Démo chargée. Le parcours de publication est prêt.");
  };

  const saveDraft = () => {
    try {
      window.localStorage.setItem("meewav:shorts:draft", JSON.stringify({
        savedAt: new Date().toISOString(),
        step,
        fileName: media?.name ?? "",
        secondaryFileName: secondaryMedia?.name ?? "",
        format,
        multicamEnabled,
        multicamLayout,
        desktopVersion,
        title,
        description,
        contentTypeLabel,
        role,
        city,
        available,
        visibility,
        primaryArtistName,
        collaboratorsText,
        publicationLinks,
        associatedType,
        associatedLabel,
        associatedUrl,
        hashtagsText,
        musicRightsConfirmed,
        imageRightsConfirmed,
        sceneVodAllowed,
        tvLinearAllowed,
        clipGenerationAllowed,
      }));
      onNotify("Brouillon enregistré sur cet appareil.");
    } catch {
      onNotify("Le brouillon n’a pas pu être enregistré sur cet appareil.");
    }
  };

  const publish = async () => {
    if (publishingRef.current) return;
    if (!media) {
      setStep(1);
      onNotify("Ajoute d’abord un média à ta publication.");
      fileInputRef.current?.click();
      return;
    }
    if (!title.trim()) {
      setStep(3);
      onNotify("Ajoute un titre avant de publier.");
      return;
    }
    if (!governancePreflight.valid) {
      setStep(4);
      onNotify("Complète les crédits et confirme les droits avant de publier.");
      return;
    }

    if (user && !media.file) { onNotify("Choisis ton fichier avant de publier sur ton compte."); return; }
    if (user && multicamEnabled && secondaryMedia && !secondaryMedia.file) {
      onNotify("Choisis le fichier de la seconde caméra avant de publier sur ton compte.");
      return;
    }
    publishingRef.current = true;
    setPublishing(true);
    let persistedMediaId: string | null = null;
    let persistedSourceUrl = media.url;
    let persistedSecondaryUrl = secondaryMedia?.url;
    if (media.file && user) {
      const newUploadIds: string[] = [];
      try {
        const uploaded = await profileMediaRepository.uploadOwnerMedia(user.id, media.file, { sourcePillar: "shorts" });
        newUploadIds.push(uploaded.id);
        let secondaryMediaId: string | null = null;
        if (multicamEnabled && secondaryMedia?.file) {
          const secondary = await profileMediaRepository.uploadOwnerMedia(user.id, secondaryMedia.file, { sourcePillar: "shorts" });
          newUploadIds.push(secondary.id);
          secondaryMediaId = secondary.id;
          persistedSecondaryUrl = secondary.sourceUrl ?? secondaryMedia.url;
          await profileMediaRepository.updateOwnerMediaDetails(user.id, secondary.id, {
            name: `${title.trim()} · caméra secondaire`, description: "", contentType: contentTypeLabel,
            city, language: "fr", visibility: "private", sceneMetadata: { secondaryOf: uploaded.id },
          });
        }
        const persisted = await profileMediaRepository.updateOwnerMediaDetails(user.id, uploaded.id, {
          name: title.trim(), description, contentType: contentTypeLabel, city, language: "fr", visibility: "private",
          sceneMetadata: {
            format: outputFormat, sourceFormat: format, secondaryMediaId,
            multicamLayout: multicamEnabled ? multicamLayout : null,
            publicationLinks: publicationLinks.filter((link) => /^https?:\/\//i.test(link.url)),
            credits: governancePreflight.credits, requestedUses: governancePreflight.requestedUses,
            musicRightsConfirmed, imageRightsConfirmed, sceneVodAllowed, tvLinearAllowed, clipGenerationAllowed,
            hashtags: [...new Set(hashtagsText.split(/[\s,;]+/).map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean))].slice(0, 12),
            associatedContent: associatedType !== "none" ? { type: associatedType, label: associatedLabel, url: associatedUrl } : null,
          },
        });
        if (visibility === "public") {
          if (secondaryMediaId) await profileMediaRepository.setOwnerMediaVisibility(user.id, secondaryMediaId, true);
          await profileMediaRepository.setOwnerMediaVisibility(user.id, uploaded.id, true);
        }
        persistedMediaId = persisted.id;
        persistedSourceUrl = persisted.sourceUrl ?? uploaded.sourceUrl ?? media.url;
      } catch (error) {
        const cleanup = await Promise.allSettled(newUploadIds.reverse().map((id) =>
          profileMediaRepository.discardNewShortsUpload(user.id, id)));
        publishingRef.current = false;
        setPublishing(false);
        const reason = error instanceof Error ? error.message : "La publication n’a pas pu être enregistrée sur le serveur.";
        onNotify(cleanup.some((result) => result.status === "rejected")
          ? `${reason} Un fichier privé reste à nettoyer dans ta médiathèque.` : reason);
        return;
      }
    }

    if (media.isObjectUrl && persistedSourceUrl === media.url) {
      transferredObjectUrlRef.current = media.url;
    }
    if (secondaryMedia?.isObjectUrl && persistedSecondaryUrl === secondaryMedia.url) {
      transferredSecondaryUrlRef.current = secondaryMedia.url;
    }
    try {
      window.localStorage.removeItem("meewav:shorts:draft");
    } catch {
      // Publishing still succeeds if storage is unavailable.
    }
    const creatorName = String(user?.user_metadata?.display_name || user?.user_metadata?.full_name || primaryArtistName || "Artiste MeeWav");
    try {
      await onPublish({
      id: persistedMediaId ?? `published-${Date.now()}`,
      artistId: user?.id ?? "shorts-current-user",
      mockArtistId: user?.id ?? "shorts-current-user",
      profileId: user?.id,
      title: title.trim(),
      artist: creatorName,
      publisher: { type: "artist", artistId: user?.id ?? "shorts-current-user", name: creatorName },
      image: outputFormat === "portrait"
        ? "/images/shorts/walls/vertical/vertical-01.webp"
        : "/images/shorts/catalog-v3/daily-01-soul-singer.webp",
      // Keep the canonical source populated for legacy adapters; the player
      // selects `audioUrl` when the presentation format is audio-only.
      video: persistedSourceUrl,
      audioUrl: media.kind === "audio" ? persistedSourceUrl : undefined,
      presentationFormat: media.kind === "audio"
        ? "audio_visualizer"
        : outputFormat === "portrait"
          ? "vertical"
          : "landscape",
      format: outputFormat,
      sourceFormat: format,
      linkedDesktopVersion: desktopVersion,
      secondaryVideo: multicamEnabled ? persistedSecondaryUrl : undefined,
      multicamLayout: multicamEnabled && secondaryMedia ? multicamLayout : undefined,
      alt: `${media.kind === "audio" ? "Création audio" : "Vidéo"} publiée par ${creatorName} : ${title.trim()}`,
      duration: media.durationLabel ?? "0:00",
      contentTypeLabel,
      meta: `${media.kind === "audio" ? "Création audio · visualizer" : desktopVersion ? "Short + version 16:9 liés" : outputFormat === "portrait" ? "Short" : "Vidéo 16:9"} · ${visibility === "public" ? "Public" : "Portfolio"}`,
      role,
      city: city.trim() || "France",
      views: "Nouvelle",
      gradeLevel: 3,
      likeCount: 0,
      goldenLikeCount: 0,
      badge: "Ta publication",
      availability: available ? "Disponible pour collaborer" : undefined,
      description: description.trim() || "Nouvelle vidéo publiée dans La Scène.",
      publishedAt: new Date().toISOString(),
      publicationLinks: publicationLinks.flatMap((link) => {
        const label = link.label.trim();
        const url = link.url.trim();
        if (!label || !/^https?:\/\//i.test(url)) return [];
        return [{ label, url }];
      }),
      credits: governancePreflight.credits.map((credit) => ({ name: credit.displayName, role: credit.role === "primaryArtist" ? "Artiste principal" : "Collaboration" })),
      associatedContent: associatedType !== "none" && associatedLabel.trim()
        ? { type: associatedType, label: associatedLabel.trim(), url: /^https?:\/\//i.test(associatedUrl.trim()) ? associatedUrl.trim() : undefined }
        : undefined,
      hashtags: [...new Set(hashtagsText.split(/[\s,;]+/).map((hashtag) => hashtag.trim().replace(/^#+/, "")).filter(Boolean))].slice(0, 12),
      verified: true,
      publicationGovernance: {
        validation: "local-preflight",
        requestedUses: governancePreflight.requestedUses,
        credits: governancePreflight.credits,
        confirmations: {
          musicRights: musicRightsConfirmed,
          imageRights: imageRightsConfirmed,
        },
      },
      });
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "La publication n’a pas pu être affichée. Réessaie depuis La Scène.");
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  const advance = () => {
    if (step === 1) {
      if (!media) {
        onNotify("Choisis une vidéo, un audio ou utilise la démo pour continuer.");
        fileInputRef.current?.click();
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
    void publish();
  };

  const primaryLabel = step === 1
    ? isAudioCreation ? "Configurer le visualizer" : "Configurer le multi-cam"
    : step === 2
      ? "Préparer la publication"
      : step === 3
        ? "Vérifier les crédits"
        : isAudioCreation ? "Publier la création audio" : "Publier la vidéo";

  return (
    <div
      ref={dialogRef}
      className="shorts-create-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shorts-creator-title"
      tabIndex={-1}
    >
      <button
        type="button"
        className="shorts-create-layer__backdrop"
        aria-label="Fermer la création"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="shorts-create-drawer">
        <header>
          <div>
            <span><Sparkles /></span>
            <p>
              <small>Studio La Scène</small>
              <strong id="shorts-creator-title">Publier dans La Scène</strong>
            </p>
          </div>
          <button type="button" aria-label="Fermer" data-dialog-initial-focus onClick={onClose}><X /></button>
        </header>

        <ol className="shorts-create-steps" aria-label="Étapes de publication">
          {([
            [1, "Média"],
            [2, isAudioCreation ? "Visualizer" : "Multi-cam"],
            [3, "Publication"],
            [4, "Droits"],
          ] as const).map(([stepNumber, label]) => (
            <li
              key={stepNumber}
              className={[
                step === stepNumber ? "is-active" : "",
                step > stepNumber ? "is-complete" : "",
              ].filter(Boolean).join(" ")}
            >
              <button
                type="button"
                aria-current={step === stepNumber ? "step" : undefined}
                disabled={stepNumber > 1 && !media}
                onClick={() => setStep(stepNumber)}
              >
                <span>{step > stepNumber ? <Check /> : stepNumber}</span>
                <strong>{label}</strong>
              </button>
            </li>
          ))}
        </ol>

        <div className="shorts-create-drawer__body">
          {draftRestored ? (
            <div className="shorts-creator-draft" role="status">
              <Save />
              <p>
                <strong>Brouillon restauré</strong>
                <span>Tes réglages et tes textes sont revenus. Rattache la vidéo pour continuer.</span>
              </p>
              <button type="button" aria-label="Masquer ce message" onClick={() => setDraftRestored(false)}>
                <X />
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <>
              <section
                className={`shorts-source-drop${isDragging ? " is-dragging" : ""}${media ? " has-media" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,audio/*"
                  aria-label="Choisir une vidéo ou un audio"
                  onChange={onFileChange}
                />
                {media?.kind === "video" ? (
                  <video
                    src={media.url}
                    muted
                    autoPlay
                    loop
                    playsInline
                    preload="metadata"
                    aria-label="Aperçu de la vidéo choisie"
                    onLoadedMetadata={(event) => {
                      const durationLabel = formatDuration(event.currentTarget.duration);
                      if (!durationLabel) return;
                      setMedia((current) => (
                        current && current.durationLabel !== durationLabel
                          ? { ...current, durationLabel }
                          : current
                      ));
                    }}
                  />
                ) : media?.kind === "audio" ? (
                  <div className="shorts-source-drop__audio-preview">
                    <span aria-hidden="true"><Music2 /></span>
                    <audio
                      src={media.url}
                      controls
                      preload="metadata"
                      aria-label="Aperçu de la création audio choisie"
                      onLoadedMetadata={(event) => {
                        const durationLabel = formatDuration(event.currentTarget.duration);
                        if (!durationLabel) return;
                        setMedia((current) => (
                          current && current.durationLabel !== durationLabel
                            ? { ...current, durationLabel }
                            : current
                        ));
                      }}
                    />
                  </div>
                ) : (
                  <span className="shorts-source-drop__icon"><Upload /></span>
                )}
                <div>
                  <strong>{media ? media.name : "Dépose ta vidéo ou ton audio ici"}</strong>
                  <small>{media ? media.sizeLabel : "MP4, MOV, WebM, MP3 ou WAV · jusqu’à 1 Go"}</small>
                </div>
                <div className="shorts-source-drop__actions">
                  <button type="button" onClick={() => fileInputRef.current?.click()}>
                    {media?.kind === "audio" ? <Music2 /> : <FileVideo2 />} {media ? "Remplacer" : "Choisir un média"}
                  </button>
                  <button type="button" onClick={useDemo}>
                    <Film /> Tester avec une démo
                  </button>
                </div>
              </section>

              {!isAudioCreation ? (
              <section className="shorts-format-selector" aria-labelledby="shorts-format-title">
                <header>
                  <div>
                    <small>Format source</small>
                    <h3 id="shorts-format-title">Quel format souhaites-tu publier&nbsp;?</h3>
                  </div>
                </header>
                <div>
                  <button
                    type="button"
                    className={format === "portrait" ? "is-active" : ""}
                    aria-pressed={format === "portrait"}
                    onClick={() => setFormat("portrait")}
                  >
                    <span><Smartphone /></span>
                    <strong>Short</strong>
                    <small>9:16 · mobile natif</small>
                  </button>
                  <button
                    type="button"
                    className={format === "landscape" ? "is-active" : ""}
                    aria-pressed={format === "landscape"}
                    onClick={() => setFormat("landscape")}
                  >
                    <span><Monitor /></span>
                    <strong>Vidéo horizontale</strong>
                    <small>16:9 · écran large</small>
                  </button>
                </div>
              </section>
              ) : (
                <section className="shorts-format-selector shorts-audio-format" aria-labelledby="shorts-format-title">
                  <header>
                    <div>
                      <small>Présentation audio</small>
                      <h3 id="shorts-format-title">Pochette animée et waveform</h3>
                    </div>
                  </header>
                  <p>La création reste écoutable dans La Scène et peut continuer dans le lecteur global. Aucun faux flux vidéo n’est généré.</p>
                </section>
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              {isAudioCreation ? (
                <section className="shorts-format-choice shorts-audio-visualizer-choice">
                  <div>
                    <small>Visualizer MeeWav</small>
                    <h3>La musique reste au premier plan</h3>
                    <p>La pochette, la waveform et les crédits accompagnent l’audio. Le traitement serveur calculera ensuite les niveaux et les rendus adaptatifs.</p>
                  </div>
                  <span className="shorts-audio-visualizer-choice__icon" aria-hidden="true"><Music2 /></span>
                </section>
              ) : (
              <section className="shorts-format-choice">
                <div>
                  <small>Extension MeeWav</small>
                  <h3>Créer aussi une version 16:9</h3>
                  <p>Ajoute la caméra arrière, un plan instrument ou un second angle. La même création peut être publiée dans un format horizontal premium.</p>
                </div>
                <button
                  type="button"
                  className={`shorts-multicam-toggle${multicamEnabled ? " is-active" : ""}`}
                  aria-pressed={multicamEnabled}
                  onClick={() => setMulticamEnabled((current) => !current)}
                >
                  <span><MonitorPlay /></span>
                  <div><strong>Multi-écran musical</strong><small>Deux sources synchronisées</small></div>
                  <i><span /></i>
                </button>
              </section>
              )}

              {!isAudioCreation && multicamEnabled ? (
                <section className="shorts-multicam-builder">
                  <header>
                    <div><small>Disposition</small><h3>Choisis la lecture desktop</h3></div>
                    <span><UsersRound /> 2 caméras</span>
                  </header>
                  <div className="shorts-multicam-layouts">
                    {MULTICAM_LAYOUTS.map((layout) => (
                      <button
                        key={layout.id}
                        type="button"
                        className={multicamLayout === layout.id ? "is-active" : ""}
                        aria-pressed={multicamLayout === layout.id}
                        onClick={() => setMulticamLayout(layout.id)}
                      >
                        <span className="shorts-layout-preview" data-layout={layout.id}><i /><i /></span>
                        <strong>{layout.label}</strong>
                        <small>{layout.detail}</small>
                      </button>
                    ))}
                  </div>

                  <div className="shorts-secondary-source">
                    <input
                      ref={secondaryFileInputRef}
                      type="file"
                      accept="video/*"
                      aria-label="Choisir la seconde caméra"
                      onChange={onSecondaryFileChange}
                    />
                    {secondaryMedia ? (
                      <video
                        src={secondaryMedia.url}
                        muted
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        aria-label="Aperçu de la seconde caméra"
                      />
                    ) : (
                      <span><Camera /></span>
                    )}
                    <div>
                      <strong>{secondaryMedia?.name ?? "Ajouter la seconde caméra"}</strong>
                      <small>{secondaryMedia?.sizeLabel ?? "Caméra arrière, plan instrument ou second angle"}</small>
                    </div>
                    <div>
                      <button type="button" onClick={() => secondaryFileInputRef.current?.click()}>
                        <FileVideo2 /> {secondaryMedia ? "Remplacer" : "Choisir"}
                      </button>
                      <button type="button" onClick={useSecondaryDemo}>
                        <Film /> Utiliser la démo
                      </button>
                    </div>
                  </div>
                </section>
              ) : !isAudioCreation ? (
                <div className="shorts-creator-info">
                  <Camera />
                  <p><strong>Une seule caméra sera publiée.</strong><span>Tu pourras ajouter un second angle plus tard depuis ton portfolio.</span></p>
                </div>
              ) : null}

              {!isAudioCreation ? <label className="shorts-linked-publication">
                <input
                  type="checkbox"
                  checked={desktopVersion}
                  onChange={(event) => setDesktopVersion(event.target.checked)}
                />
                <span>{desktopVersion ? <Check /> : null}</span>
                <div>
                  <strong>Lier le Short et la version 16:9</strong>
                  <small>Une seule création, deux formats reliés à la même publication</small>
                </div>
              </label> : null}
            </>
          ) : null}

          {step === 3 ? (
            <section className="shorts-portfolio-editor">
              <div className={[
                "shorts-portfolio-preview",
                `is-${outputFormat}`,
                multicamEnabled && secondaryMedia ? "has-multicam" : "",
                multicamEnabled && secondaryMedia ? `is-layout-${multicamLayout}` : "",
              ].filter(Boolean).join(" ")}>
                {isAudioCreation ? (
                  <div className="shorts-portfolio-preview__audio">
                    <Music2 aria-hidden="true" />
                    <span aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</span>
                    <audio src={media?.url} controls preload="metadata" aria-label="Aperçu audio de la publication" />
                  </div>
                ) : (
                  <video
                    className="is-primary"
                    src={media?.url}
                    muted
                    autoPlay
                    loop
                    playsInline
                    preload="metadata"
                    aria-label="Aperçu de publication"
                  />
                )}
                {!isAudioCreation && multicamEnabled && secondaryMedia ? (
                  <video
                    className="is-secondary"
                    src={secondaryMedia.url}
                    muted
                    autoPlay
                    loop
                    playsInline
                    preload="metadata"
                    aria-label="Aperçu de la seconde caméra"
                  />
                ) : null}
                <span>{isAudioCreation ? "Audio · visualizer" : desktopVersion ? "16:9 lié" : outputFormat === "portrait" ? "9:16" : "16:9"}</span>
              </div>

              <div className="shorts-portfolio-fields">
                <label>
                  <span>Type de contenu</span>
                  <select
                    value={contentTypeLabel}
                    onChange={(event) => setContentTypeLabel(
                      event.currentTarget.value as ShortsContentTypeLabel,
                    )}
                  >
                    {CREATOR_CONTENT_TYPES.map((contentType) => (
                      <option key={contentType}>{contentType}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>{isAudioCreation ? "Titre de la création audio" : "Titre de la vidéo"}</span>
                  <input
                    autoFocus
                    value={title}
                    maxLength={80}
                    placeholder={isAudioCreation ? "Donne envie d’écouter la création" : "Donne envie de lancer la vidéo"}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                  />
                  <small>{title.length}/80</small>
                </label>

                <label>
                  <span>Ta spécialité</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.currentTarget.value as typeof role)}
                  >
                    {CREATOR_ROLES.map((creatorRole) => (
                      <option key={creatorRole}>{creatorRole}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Ville ou zone</span>
                  <input
                    value={city}
                    maxLength={50}
                    onChange={(event) => setCity(event.currentTarget.value)}
                  />
                </label>

                <label className="is-wide">
                  <span>Description</span>
                  <textarea
                    value={description}
                    maxLength={240}
                    placeholder="Contexte, technique, recherche de collaboration…"
                    onChange={(event) => setDescription(event.currentTarget.value)}
                  />
                  <small>{description.length}/240</small>
                </label>
              </div>

              <section className="shorts-publication-info-editor" aria-label="Informations complémentaires">
                <header><div><strong>Informations complémentaires</strong><small>Facultatif · affiché avec le Short</small></div><Link2 aria-hidden="true" /></header>
                <fieldset>
                  <legend>Liens</legend>
                  {publicationLinks.map((link, index) => <div className="shorts-publication-info-editor__link" key={index}>
                    <input aria-label={`Libellé du lien ${index + 1}`} placeholder="Ex. Écouter le morceau" value={link.label} maxLength={60} onChange={(event) => setPublicationLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.currentTarget.value } : item))} />
                    <input aria-label={`URL du lien ${index + 1}`} placeholder="https://…" value={link.url} onChange={(event) => setPublicationLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.currentTarget.value } : item))} />
                    <button type="button" onClick={() => setPublicationLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Retirer le lien ${index + 1}`}><X aria-hidden="true" /></button>
                  </div>)}
                  {publicationLinks.length < 6 ? <button type="button" onClick={() => setPublicationLinks((current) => [...current, { label: "", url: "" }])}><Link2 aria-hidden="true" /> Ajouter un lien</button> : null}
                </fieldset>
                <div className="shorts-publication-info-editor__association">
                  <label><span>Contenu associé</span><select value={associatedType} onChange={(event) => setAssociatedType(event.currentTarget.value as typeof associatedType)}><option value="none">Aucun</option><option value="track">Morceau</option><option value="project">Projet</option><option value="room">Room</option></select></label>
                  {associatedType !== "none" ? <><label><span>Nom</span><input value={associatedLabel} placeholder="Nom du contenu" onChange={(event) => setAssociatedLabel(event.currentTarget.value)} /></label><label><span>Lien</span><input value={associatedUrl} placeholder="Lien facultatif" onChange={(event) => setAssociatedUrl(event.currentTarget.value)} /></label></> : null}
                </div>
                <label className="shorts-publication-info-editor__hashtags"><span><Hash aria-hidden="true" /> Hashtags</span><input value={hashtagsText} placeholder="#live #studio #collaboration" onChange={(event) => setHashtagsText(event.currentTarget.value)} /></label>
              </section>

              <fieldset className="shorts-visibility-choice">
                <legend>Visibilité</legend>
                <button
                  type="button"
                  className={visibility === "public" ? "is-active" : ""}
                  aria-pressed={visibility === "public"}
                  onClick={() => setVisibility("public")}
                >
                  <Sparkles /><span><strong>Découverte publique</strong><small>Visible dans les sélections de La Scène</small></span>
                </button>
                <button
                  type="button"
                  className={visibility === "portfolio" ? "is-active" : ""}
                  aria-pressed={visibility === "portfolio"}
                  onClick={() => setVisibility("portfolio")}
                >
                  <MonitorPlay /><span><strong>Portfolio uniquement</strong><small>Partage direct depuis ton profil</small></span>
                </button>
              </fieldset>

              <label className="shorts-filter-availability">
                <input
                  type="checkbox"
                  checked={available}
                  onChange={(event) => setAvailable(event.currentTarget.checked)}
                />
                <span><i /></span>
                <div>
                  <strong>Disponible pour collaborer</strong>
                  <small>Les équipes pourront proposer un projet depuis cette vidéo.</small>
                </div>
              </label>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="shorts-rights-editor" aria-labelledby="shorts-rights-title">
              <header>
                <div>
                  <small>Crédits &amp; droits</small>
                  <h3 id="shorts-rights-title">Attribue la création avant sa diffusion</h3>
                  <p>Les crédits, la VOD, la TV et les extraits restent des autorisations distinctes.</p>
                </div>
                <span aria-hidden="true"><ShieldCheck /></span>
              </header>

              <div className="shorts-rights-credits">
                <label>
                  <span>Artiste principal</span>
                  <div><Music2 aria-hidden="true" /><input
                    value={primaryArtistName}
                    maxLength={80}
                    placeholder="Nom affiché dans les crédits"
                    onChange={(event) => setPrimaryArtistName(event.currentTarget.value)}
                  /></div>
                </label>
                <label>
                  <span>Collaborateurs</span>
                  <div><UserRoundPlus aria-hidden="true" /><input
                    value={collaboratorsText}
                    maxLength={240}
                    placeholder="Alya Flow, Sacha Beat…"
                    onChange={(event) => setCollaboratorsText(event.currentTarget.value)}
                  /></div>
                  <small>Sépare les noms par une virgule.</small>
                </label>
              </div>

              <div className="shorts-rights-confirmations" aria-label="Confirmations obligatoires">
                <label>
                  <input
                    type="checkbox"
                    checked={musicRightsConfirmed}
                    onChange={(event) => setMusicRightsConfirmed(event.currentTarget.checked)}
                  />
                  <span>{musicRightsConfirmed ? <Check aria-hidden="true" /> : <Music2 aria-hidden="true" />}</span>
                  <div>
                    <strong>Droits musique confirmés</strong>
                    <small>Je dispose des autorisations pour la musique et les contributions audio.</small>
                  </div>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={imageRightsConfirmed}
                    onChange={(event) => setImageRightsConfirmed(event.currentTarget.checked)}
                  />
                  <span>{imageRightsConfirmed ? <Check aria-hidden="true" /> : <Image aria-hidden="true" />}</span>
                  <div>
                    <strong>Droits image confirmés</strong>
                    <small>Je dispose des autorisations pour les images et les personnes visibles.</small>
                  </div>
                </label>
              </div>

              <fieldset className="shorts-rights-uses">
                <legend>Autorisations de diffusion</legend>
                <label className={sceneVodAllowed ? "is-active" : ""}>
                  <input
                    type="checkbox"
                    checked={sceneVodAllowed}
                    onChange={(event) => setSceneVodAllowed(event.currentTarget.checked)}
                  />
                  <span aria-hidden="true"><MonitorPlay /></span>
                  <div>
                    <strong>La Scène VOD</strong>
                    <small>Publier cette création à la demande dans La Scène.</small>
                  </div>
                  <i>Requis</i>
                </label>
                <label className={tvLinearAllowed ? "is-active" : ""}>
                  <input
                    type="checkbox"
                    checked={tvLinearAllowed}
                    onChange={(event) => setTvLinearAllowed(event.currentTarget.checked)}
                  />
                  <span aria-hidden="true"><Tv /></span>
                  <div>
                    <strong>MeeWav TV · diffusion linéaire</strong>
                    <small>Autorisation séparée. Elle ne garantit aucune programmation.</small>
                  </div>
                  <i>Optionnel</i>
                </label>
                <label className={clipGenerationAllowed ? "is-active" : ""}>
                  <input
                    type="checkbox"
                    checked={clipGenerationAllowed}
                    onChange={(event) => setClipGenerationAllowed(event.currentTarget.checked)}
                  />
                  <span aria-hidden="true"><Scissors /></span>
                  <div>
                    <strong>Génération d’extraits</strong>
                    <small>Autoriser des clips dérivés sans autoriser la TV.</small>
                  </div>
                  <i>Optionnel</i>
                </label>
              </fieldset>

              <div
                className={`shorts-rights-status${governancePreflight.valid ? " is-ready" : ""}`}
                role="status"
                aria-live="polite"
              >
                <ShieldCheck aria-hidden="true" />
                <p>
                  <strong>{governancePreflight.valid
                    ? "Prévalidation locale complète"
                    : "Autorisations à compléter"}</strong>
                  <span>{governancePreflight.valid
                    ? "Le service de publication devra encore enregistrer et vérifier les preuves."
                    : "Renseigne l’artiste principal, conserve La Scène VOD et confirme musique et image."}</span>
                </p>
              </div>
            </section>
          ) : null}
        </div>

        <footer className="shorts-creator-footer">
          <button type="button" onClick={saveDraft}><Save /> Enregistrer le brouillon</button>
          <div>
            {step > 1 ? (
              <button type="button" onClick={() => setStep((step - 1) as CreatorStep)}>
                <ChevronLeft /> Retour
              </button>
            ) : null}
            <button type="button" className="is-primary" onClick={advance} disabled={publishing}>
              {publishing ? "Publication…" : primaryLabel} <ChevronRight />
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
