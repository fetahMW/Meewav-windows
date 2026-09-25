import { useId, useMemo, useState } from "react";
import {
  CircleAlert,
  ExternalLink,
  Info,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { AudioEnginePlugin } from "../audio-engine/audioEngine.types";
import type { PlaceNativePitchProvider } from "./place.types";
import "./place-plugin-manager.css";

export type PlaceSupportedPluginId =
  | "antares.autotune"
  | "resonantcavity.voloco-producer"
  | "sixthsample.spoton"
  | "auburnsounds.graillon3";
export type PlaceRunnablePluginId = PlaceNativePitchProvider;

export type PlacePluginManagerProps = {
  /** Sanitized plugin summaries returned by MeeWav Audio Engine. */
  plugins: readonly AudioEnginePlugin[];
  activePluginId: PlaceRunnablePluginId | null;
  refreshing?: boolean;
  disabled?: boolean;
  onUse: (pluginId: PlaceRunnablePluginId) => void | Promise<void>;
  onRemoveFromChain: (pluginId: PlaceRunnablePluginId) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
};

type CatalogPlugin = {
  id: PlaceSupportedPluginId;
  name: string;
  vendor: string;
  officialUrl: string;
};

const PLACE_PLUGIN_CATALOG: readonly CatalogPlugin[] = Object.freeze([
  Object.freeze({
    id: "antares.autotune",
    name: "Auto-Tune Pro",
    vendor: "Antares",
    officialUrl: "https://www.antarestech.com/products/auto-tune/pro",
  }),
  Object.freeze({
    id: "resonantcavity.voloco-producer",
    name: "Voloco Producer",
    vendor: "Resonant Cavity",
    officialUrl: "https://resonantcavity.com/",
  }),
  Object.freeze({
    id: "sixthsample.spoton",
    name: "Spoton",
    vendor: "Sixth Sample",
    officialUrl: "https://sixthsample.com/spoton/",
  }),
  Object.freeze({
    id: "auburnsounds.graillon3",
    name: "Graillon 3",
    vendor: "Auburn Sounds",
    officialUrl: "https://www.auburnsounds.com/products/Graillon.html",
  }),
]);

type PluginStatusPresentation = {
  label: string;
  tone: "ready" | "idle" | "warning" | "error";
};

function LocalPluginGlyph() {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="7" y1="32" x2="33" y2="7" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dfe1e6" />
          <stop offset=".52" stopColor="#ae70eb" />
          <stop offset="1" stopColor="#7040c2" />
        </linearGradient>
      </defs>
      <path d="m14 9 17 17m-4-21-6 6m14 0-6 6M12.5 17.5l10 10-3.2 3.2a7.1 7.1 0 0 1-10 0 7.1 7.1 0 0 1 0-10l3.2-3.2ZM9.1 30.9 5 35" stroke={`url(#${gradientId})`} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function statusPresentation(plugin: AudioEnginePlugin | undefined): PluginStatusPresentation {
  if (!plugin || plugin.status === "missing") return { label: "Non détecté", tone: "idle" };
  if (plugin.status === "ready" && plugin.licensed) return { label: "Prêt", tone: "ready" };
  if (isDetectedCandidate(plugin)) return { label: "À vérifier", tone: "warning" };
  if (plugin.status === "unlicensed") return { label: "Activation requise", tone: "warning" };
  if (plugin.status === "scan_error") return { label: "Analyse échouée", tone: "error" };
  return { label: "Indisponible", tone: "idle" };
}

function isReady(plugin: AudioEnginePlugin | undefined) {
  return plugin?.status === "ready" && plugin.licensed;
}

function isDetectedCandidate(plugin: AudioEnginePlugin | undefined) {
  return plugin?.status === "disabled"
    && plugin.capabilities.includes("detected_local")
    && plugin.capabilities.includes("probe_required")
    && plugin.capabilities.includes("native_host_available");
}

function isRunnablePluginId(pluginId: PlaceSupportedPluginId): pluginId is PlaceRunnablePluginId {
  return pluginId === "antares.autotune"
    || pluginId === "sixthsample.spoton"
    || pluginId === "auburnsounds.graillon3";
}

export default function PlacePluginManager({
  plugins,
  activePluginId,
  refreshing = false,
  disabled = false,
  onUse,
  onRemoveFromChain,
  onRefresh,
}: PlacePluginManagerProps) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hiddenPluginIds, setHiddenPluginIds] = useState<PlaceSupportedPluginId[]>([]);
  const pluginById = useMemo(
    () => new Map(plugins.map((plugin) => [plugin.id, plugin])),
    [plugins],
  );
  const blocked = disabled || refreshing || pendingAction !== null;

  const runAction = async (key: string, action: () => void | Promise<void>) => {
    if (blocked) return;
    setPendingAction(key);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "L’action n’a pas pu être effectuée.");
    } finally {
      setPendingAction(null);
    }
  };

  const detectedPlugins = PLACE_PLUGIN_CATALOG.filter((entry) => {
    const plugin = pluginById.get(entry.id);
    return isRunnablePluginId(entry.id)
      && !hiddenPluginIds.includes(entry.id)
      && (isReady(plugin) || isDetectedCandidate(plugin));
  });
  const detectedCount = detectedPlugins.length;

  const scanComputer = () => runAction("refresh", async () => {
    await onRefresh();
    setHiddenPluginIds([]);
  });

  const forgetPlugin = (pluginId: PlaceRunnablePluginId) => runAction(`forget:${pluginId}`, async () => {
    if (activePluginId === pluginId) await onRemoveFromChain(pluginId);
    setHiddenPluginIds((current) => current.includes(pluginId) ? current : [...current, pluginId]);
  });

  return (
    <section className="place-plugin-manager" aria-labelledby="place-plugin-manager-title">
      <header className="place-plugin-manager__header">
        <strong id="place-plugin-manager-title">Plugins locaux</strong>
        <button
          type="button"
          className="place-plugin-manager__refresh"
          disabled={blocked}
          onClick={() => { void scanComputer(); }}
          aria-label="Scanner mon PC pour détecter les plugins"
          title="Scanner les dossiers VST3 standards de ce PC"
        >
          <RefreshCw aria-hidden="true" className={refreshing || pendingAction === "refresh" ? "is-spinning" : ""} />
          <span>{refreshing || pendingAction === "refresh" ? "Scan…" : "Scanner le PC"}</span>
        </button>
      </header>

      <div className="place-plugin-manager__list" aria-label="Plugins vocaux détectés">
        {detectedPlugins.map((catalogPlugin) => {
          const plugin = pluginById.get(catalogPlugin.id);
          const status = statusPresentation(plugin);
          const detectedCandidate = isDetectedCandidate(plugin);
          const active = activePluginId === catalogPlugin.id && Boolean(plugin);
          const actionPending = pendingAction === `use:${catalogPlugin.id}`
            || pendingAction === `remove:${catalogPlugin.id}`;
          return (
            <article className="place-plugin-manager__plugin" key={catalogPlugin.id} data-active={active || undefined}>
              <div className="place-plugin-manager__identity">
                <span aria-hidden="true"><LocalPluginGlyph /></span>
                <div>
                  <strong>{plugin?.name || catalogPlugin.name}</strong>
                  <small>
                    {plugin?.vendor || catalogPlugin.vendor}
                    {plugin?.version && plugin.version !== "inconnue" ? ` · version ${plugin.version}` : ""}
                  </small>
                </div>
              </div>
              <span className="place-plugin-manager__status" data-tone={active ? "active" : status.tone}>
                {active ? "Effets casque actifs" : status.label}
              </span>
              <div className="place-plugin-manager__actions">
                <button
                  type="button"
                  className={active ? "is-active-action" : undefined}
                  disabled={active || blocked || (!isReady(plugin) && !detectedCandidate) || !isRunnablePluginId(catalogPlugin.id)}
                  onClick={() => {
                    const pluginId = catalogPlugin.id;
                    if (!isRunnablePluginId(pluginId)) return;
                    void runAction(`use:${pluginId}`, () => onUse(pluginId));
                  }}
                >
                  {active ? <ShieldCheck aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
                  {active ? "Utilisé" : actionPending ? "Vérification…" : "Vérifier et utiliser"}
                </button>
                <button
                  type="button"
                  className="is-delete"
                  disabled={blocked}
                  onClick={() => { void forgetPlugin(catalogPlugin.id as PlaceRunnablePluginId); }}
                  aria-label={`Retirer ${plugin?.name || catalogPlugin.name} de MeeWav`}
                  title="Retire ce plugin de la liste MeeWav sans le désinstaller de Windows"
                >
                  <Trash2 aria-hidden="true" />
                  {pendingAction === `forget:${catalogPlugin.id}` ? "Retrait…" : "Retirer"}
                </button>
              </div>
            </article>
          );
        })}
        {detectedCount === 0 ? (
          <div className="place-plugin-manager__empty">
            <PlugZap aria-hidden="true" />
            <span><strong>Aucun plugin utilisable affiché</strong><small>Lance un scan réel des dossiers VST3 de ce PC.</small></span>
          </div>
        ) : null}
      </div>

      <p className="place-plugin-manager__scan-note"><Info aria-hidden="true" /><span>Retirer un plugin le déconnecte de MeeWav sans le désinstaller.</span></p>

      <button
        type="button"
        className="place-plugin-manager__add"
        aria-expanded={catalogOpen}
        aria-controls="place-plugin-manager-catalog"
        onClick={() => setCatalogOpen((open) => !open)}
      >
        <Plus aria-hidden="true" /> Installer un plugin
      </button>

      {catalogOpen ? (
        <aside className="place-plugin-manager__catalog" id="place-plugin-manager-catalog" aria-label="Catalogue de plugins compatibles">
          <header>
            <div>
              <small>CATALOGUE COMPATIBLE</small>
              <strong>Installer depuis le site officiel</strong>
            </div>
            <button type="button" onClick={() => setCatalogOpen(false)} aria-label="Fermer le catalogue de plugins">
              <X aria-hidden="true" />
            </button>
          </header>
          <p>
            Installe le VST3 avec l’installateur de son éditeur, puis reviens ici et lance Scanner mon PC.
            MeeWav ne reçoit aucun chemin de fichier et ne désinstalle rien depuis le Web.
          </p>
          <div className="place-plugin-manager__catalog-list">
            {PLACE_PLUGIN_CATALOG.map((plugin) => (
              <a key={plugin.id} href={plugin.officialUrl} target="_blank" rel="noreferrer noopener">
                <span><strong>{plugin.name}</strong><small>{plugin.vendor}</small></span>
                <span>Site officiel <ExternalLink aria-hidden="true" /></span>
              </a>
            ))}
          </div>
          <button
            type="button"
            className="place-plugin-manager__catalog-refresh"
            disabled={blocked}
            onClick={() => { void scanComputer(); }}
          >
            <RefreshCw aria-hidden="true" /> Scanner après installation
          </button>
        </aside>
      ) : null}

      {actionError ? <p className="place-plugin-manager__error" role="alert"><CircleAlert aria-hidden="true" /> {actionError}</p> : null}
    </section>
  );
}
