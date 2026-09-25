import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AudioLines,
  Check,
  CircleAlert,
  Headphones,
  Mic2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAudioEngine } from "./AudioEngineContext";
import type {
  AudioEngineChain,
  AudioEnginePlugin,
} from "./audioEngine.types";
import "./voice-fx-engine-panel.css";

type VocalProvider = "antares" | "voloco";

type VoiceFxSettings = {
  provider: VocalProvider;
  enabled: boolean;
  preset: VoicePreset;
  key: MusicalKey;
  scale: MusicalScale;
  correctionAmount: number;
  compressionAmount: number;
  reverbAmount: number;
};

type VoicePreset =
  | "Naturel"
  | "Pop"
  | "Rap"
  | "Rap mélodique"
  | "R&B"
  | "Soul"
  | "Live acoustique"
  | "Voix parlée"
  | "Effet assumé";

type MusicalKey = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
type MusicalScale = "major" | "minor" | "chromatic";

type VoiceFxEnginePanelProps = {
  className?: string;
  title?: string;
};

const PROVIDERS: Array<{ id: VocalProvider; name: string; caption: string }> = [
  { id: "antares", name: "Antares Auto-Tune", caption: "Correction professionnelle" },
  { id: "voloco", name: "Voloco Producer", caption: "Traitement vocal créatif" },
];

const MUSICAL_KEYS: MusicalKey[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALE_LABELS: Record<MusicalScale, string> = {
  major: "Majeur",
  minor: "Mineur",
  chromatic: "Chromatique",
};

const PRESETS: Record<VoicePreset, Pick<VoiceFxSettings, "correctionAmount" | "compressionAmount" | "reverbAmount">> = {
  Naturel: { correctionAmount: 0.45, compressionAmount: 0.28, reverbAmount: 0.12 },
  Pop: { correctionAmount: 0.72, compressionAmount: 0.38, reverbAmount: 0.24 },
  Rap: { correctionAmount: 0.8, compressionAmount: 0.42, reverbAmount: 0.15 },
  "Rap mélodique": { correctionAmount: 0.88, compressionAmount: 0.46, reverbAmount: 0.28 },
  "R&B": { correctionAmount: 0.62, compressionAmount: 0.38, reverbAmount: 0.32 },
  Soul: { correctionAmount: 0.42, compressionAmount: 0.31, reverbAmount: 0.24 },
  "Live acoustique": { correctionAmount: 0.28, compressionAmount: 0.22, reverbAmount: 0.18 },
  "Voix parlée": { correctionAmount: 0.08, compressionAmount: 0.34, reverbAmount: 0.06 },
  "Effet assumé": { correctionAmount: 1, compressionAmount: 0.52, reverbAmount: 0.34 },
};

const DEFAULT_SETTINGS: VoiceFxSettings = {
  provider: "antares",
  enabled: false,
  preset: "Naturel",
  key: "C",
  scale: "major",
  correctionAmount: PRESETS.Naturel.correctionAmount,
  compressionAmount: PRESETS.Naturel.compressionAmount,
  reverbAmount: PRESETS.Naturel.reverbAmount,
};

const BUSY_STATUSES = new Set(["detecting", "pairing", "connecting"]);

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function numeric(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function pluginProvider(plugin: AudioEnginePlugin): VocalProvider | null {
  const identity = `${plugin.id} ${plugin.vendor} ${plugin.name}`.toLowerCase();
  if (identity.includes("antares") || identity.includes("auto-tune") || identity.includes("autotune")) return "antares";
  if (identity.includes("voloco") || identity.includes("resonantcavity")) return "voloco";
  return null;
}

function descriptorForProvider(plugins: AudioEnginePlugin[], provider: VocalProvider) {
  return plugins.find((plugin) => pluginProvider(plugin) === provider) ?? null;
}

function pluginReady(plugin: AudioEnginePlugin | null): plugin is AudioEnginePlugin {
  return plugin?.status === "ready" && plugin.licensed;
}

function providerFromChain(chain: AudioEngineChain | null, plugins: AudioEnginePlugin[]) {
  const pluginId = chain?.vocalTuning.provider ?? "";
  const plugin = pluginId ? plugins.find((candidate) => candidate.id === pluginId) ?? null : null;
  const fromDescriptor = plugin ? pluginProvider(plugin) : null;
  if (fromDescriptor) return fromDescriptor;
  const provider = normalized(pluginId);
  if (provider.includes("voloco")) return "voloco";
  if (provider.includes("antares") || provider.includes("autotune") || provider.includes("auto-tune")) return "antares";
  return descriptorForProvider(plugins, "antares") ? "antares" : descriptorForProvider(plugins, "voloco") ? "voloco" : "antares";
}

function settingsFromChain(
  chain: AudioEngineChain | null,
  plugins: AudioEnginePlugin[],
  retainedPreset: VoicePreset = "Naturel",
): VoiceFxSettings {
  const key = normalized(chain?.vocalTuning.key).toUpperCase();
  const scale = normalized(chain?.vocalTuning.scale);

  return {
    provider: providerFromChain(chain, plugins),
    enabled: chain?.vocalTuning.enabled ?? false,
    // The preset label is a MeeWav UI convenience. The native contract stores
    // the resulting canonical values, never a proprietary vendor preset.
    preset: retainedPreset,
    key: MUSICAL_KEYS.includes(key as MusicalKey) ? key as MusicalKey : "C",
    scale: scale === "minor" || scale === "chromatic" ? scale : "major",
    correctionAmount: numeric(chain?.vocalTuning.correctionAmount, DEFAULT_SETTINGS.correctionAmount),
    compressionAmount: numeric(chain?.compressor.amount, DEFAULT_SETTINGS.compressionAmount),
    reverbAmount: numeric(chain?.reverb.amount, DEFAULT_SETTINGS.reverbAmount),
  };
}

function updateCanonicalChain(
  chain: AudioEngineChain,
  settings: VoiceFxSettings,
  plugin: AudioEnginePlugin,
) {
  return {
    ...chain,
    vocalTuning: {
      ...chain.vocalTuning,
      enabled: settings.enabled,
      provider: plugin.id,
      key: settings.key,
      scale: settings.scale,
      correctionAmount: settings.correctionAmount,
    },
    compressor: {
      ...chain.compressor,
      provider: "meewav.compressor",
      amount: settings.compressionAmount,
    },
    reverb: {
      ...chain.reverb,
      provider: "meewav.reverb",
      amount: settings.reverbAmount,
    },
  };
}

function pluginStatus(plugin: AudioEnginePlugin | null, engineConnected: boolean) {
  if (!engineConnected) return { label: "À vérifier", tone: "idle", detail: "Associe le moteur pour vérifier l’installation et la licence." };
  if (!plugin) return { label: "Non détecté", tone: "error", detail: "Ce plugin n’est pas déclaré par le registre local autorisé." };
  if (plugin.status === "missing") return { label: "Non installé", tone: "error", detail: "Le moteur ne trouve pas ce plugin dans les emplacements VST3 standards." };
  if (plugin.status === "unlicensed" || !plugin.licensed) return { label: "Activation requise", tone: "warning", detail: "Le plugin est détecté, mais sa licence vendor n’est pas active." };
  if (plugin.status === "scan_error") return { label: "Analyse échouée", tone: "error", detail: "Le scanner isolé n’a pas pu valider ce plugin." };
  if (plugin.status === "disabled") return { label: "Désactivé", tone: "warning", detail: "Ce plugin n’est pas autorisé par la configuration actuelle du moteur." };
  return { label: "Prêt", tone: "ready", detail: `${plugin.name} ${plugin.version} est déclaré prêt et licencié par le registre local. L’activation reste contrôlée par l’éditeur.` };
}

function latencyStatus(latencyMs: number | null) {
  if (latencyMs === null) return { value: "—", label: "Mesurée au démarrage", tone: "idle" };
  if (latencyMs < 15) return { value: `${Math.round(latencyMs)} ms`, label: "Excellente", tone: "ready" };
  if (latencyMs <= 25) return { value: `${Math.round(latencyMs)} ms`, label: "Correcte", tone: "warning" };
  return { value: `${Math.round(latencyMs)} ms`, label: "Élevée", tone: "error" };
}

function meterPercent(db: number | undefined) {
  if (typeof db !== "number" || !Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db + 72) / 72) * 100));
}

function RangeControl({
  label,
  value,
  disabled,
  onDraft,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onDraft: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const lastCommitRef = useRef({ value: Number.NaN, at: 0 });
  const commitFromTarget = (target: HTMLInputElement) => {
    const nextValue = Number(target.value);
    const now = Date.now();
    if (lastCommitRef.current.value === nextValue && now - lastCommitRef.current.at < 250) return;
    lastCommitRef.current = { value: nextValue, at: now };
    onCommit(nextValue);
  };
  return (
    <label className="voice-fx-engine__range">
      <span><strong>{label}</strong><output>{Math.round(value * 100)} %</output></span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onDraft(Number(event.currentTarget.value))}
        onPointerUp={(event) => commitFromTarget(event.currentTarget)}
        onKeyUp={(event) => commitFromTarget(event.currentTarget)}
        onBlur={(event) => commitFromTarget(event.currentTarget)}
        style={{ "--voice-fx-range-progress": `${value * 100}%` } as CSSProperties}
      />
    </label>
  );
}

function StatusNotice({ icon, title, children, tone = "idle" }: { icon: ReactNode; title: string; children: ReactNode; tone?: string }) {
  return (
    <div className="voice-fx-engine__notice" data-tone={tone}>
      <span aria-hidden="true">{icon}</span>
      <div><strong>{title}</strong><div className="voice-fx-engine__notice-body">{children}</div></div>
    </div>
  );
}

export function VoiceFxEnginePanel({ className = "", title = "Effets voix" }: VoiceFxEnginePanelProps) {
  const engine = useAudioEngine();
  const [draft, setDraft] = useState<VoiceFxSettings>(() => settingsFromChain(engine.chain, engine.plugins));
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const pendingSettingsRef = useRef<VoiceFxSettings | null>(null);
  const connected = engine.status === "connected" && engine.transport === "native";
  const handoffRecoveryRequired = Boolean(engine.fallbackReason) && engine.transport !== "web_audio";
  const monitoringAvailable = connected && engine.health?.audioPlane !== "unavailable";
  const busy = saving || BUSY_STATUSES.has(engine.status);
  const completeChain = Boolean(engine.chain);
  const selectedPlugin = descriptorForProvider(engine.plugins, draft.provider);
  const selectedReady = connected && pluginReady(selectedPlugin);
  const controlsReady = selectedReady && completeChain && !busy;
  const selectedStatus = pluginStatus(selectedPlugin, connected);
  const latency = latencyStatus(engine.monitoring?.latencyMs ?? null);
  const inputMeter = engine.meterFrame?.input[0];
  const outputMeter = engine.meterFrame?.output[0];

  useEffect(() => {
    if (!saving) {
      setDraft((current) => settingsFromChain(engine.chain, engine.plugins, current.preset));
    }
  }, [engine.chain, engine.plugins, saving]);

  const providerDescriptors = useMemo(() => ({
    antares: descriptorForProvider(engine.plugins, "antares"),
    voloco: descriptorForProvider(engine.plugins, "voloco"),
  }), [engine.plugins]);

  const persist = async (next: VoiceFxSettings) => {
    setDraft(next);
    setActionError(null);
    if (!engine.chain || !connected) {
      setActionError("Associe MeeWav Audio Engine avant de modifier la chaîne vocale.");
      return;
    }
    const plugin = descriptorForProvider(engine.plugins, next.provider);
    if (!pluginReady(plugin)) {
      setActionError(pluginStatus(plugin, connected).detail);
      return;
    }
    pendingSettingsRef.current = next;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      let currentChain = engine.chain;
      while (pendingSettingsRef.current) {
        const pending = pendingSettingsRef.current;
        pendingSettingsRef.current = null;
        const pendingPlugin = descriptorForProvider(engine.plugins, pending.provider);
        if (!pluginReady(pendingPlugin)) {
          throw new Error(pluginStatus(pendingPlugin, connected).detail);
        }
        currentChain = await engine.updateChain(updateCanonicalChain(currentChain, pending, pendingPlugin));
      }
    } catch (error) {
      pendingSettingsRef.current = null;
      setActionError(error instanceof Error ? error.message : "La chaîne vocale n’a pas pu être mise à jour.");
      setDraft(settingsFromChain(engine.chain, engine.plugins));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const applyPreset = (preset: VoicePreset) => {
    const next = { ...draft, preset, ...PRESETS[preset] };
    void persist(next);
  };

  const toggleMonitoring = async () => {
    if (!monitoringAvailable) {
      setActionError(connected
        ? "Le moteur de contrôle est associé, mais son plan audio local n’est pas disponible."
        : "Associe MeeWav Audio Engine pour écouter le retour traité dans ton casque.");
      return;
    }
    if (savingRef.current) return;
    setActionError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await engine.setMonitoring(!engine.monitoring?.enabled);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Le retour casque n’a pas pu être modifié.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section className={`voice-fx-engine ${className}`.trim()} aria-labelledby="voice-fx-engine-title">
      <header className="voice-fx-engine__header">
        <span className="voice-fx-engine__mark"><AudioLines aria-hidden="true" /></span>
        <div>
          <small>VOIX · TRAITEMENT LOCAL</small>
          <h2 id="voice-fx-engine-title">{title}</h2>
          <p>Retour casque local. La publication Room s’active uniquement quand le pont RTC est raccordé.</p>
        </div>
        <span className="voice-fx-engine__connection" data-connected={connected || undefined}>
          <i /> {connected ? "Moteur connecté" : "Moteur non associé"}
        </span>
      </header>

      {handoffRecoveryRequired ? (
        <StatusNotice icon={<CircleAlert />} title="La piste native s’est interrompue" tone="error">
          {engine.fallbackReason} Reconnecte le moteur ou autorise explicitement le micro navigateur. Aucun basculement silencieux n’est effectué.
          <button type="button" className="voice-fx-engine__inline-cta" onClick={() => { void engine.launchAndPair(); }} disabled={busy}>
            <RefreshCw aria-hidden="true" /> {busy ? "Reconnexion…" : "Reconnecter"}
          </button>
          <button type="button" className="voice-fx-engine__inline-cta is-secondary" onClick={() => { void engine.useWebAudioFallback("Continuer sans les effets desktop."); }} disabled={busy}>
            Continuer sans effets
          </button>
        </StatusNotice>
      ) : !connected ? (
        <StatusNotice icon={<PlugZap />} title="Active le traitement professionnel" tone={engine.status === "error" || engine.status === "incompatible" ? "error" : "idle"}>
          {engine.status === "incompatible"
            ? engine.compatibility?.reason ?? "La version du moteur doit être mise à jour."
            : engine.error ?? "MeeWav doit lancer et associer son moteur audio installé sur cet ordinateur."}
          <button type="button" className="voice-fx-engine__inline-cta" onClick={() => { void engine.launchAndPair(); }} disabled={busy}>
            <PlugZap aria-hidden="true" /> {busy ? "Association…" : "Lancer et associer"}
          </button>
        </StatusNotice>
      ) : null}

      {connected && !completeChain ? (
        <StatusNotice icon={<CircleAlert />} title="Chaîne vocale incomplète" tone="warning">
          Le moteur ne transmet pas encore les slots Voix, Compression et Reverb attendus. Aucun traitement n’est simulé.
          <button type="button" className="voice-fx-engine__inline-cta" onClick={() => { void engine.refresh(); }} disabled={busy}>
            <RefreshCw aria-hidden="true" /> Actualiser
          </button>
        </StatusNotice>
      ) : null}

      {connected && !handoffRecoveryRequired && engine.health?.audioPlane === "unavailable" ? (
        <StatusNotice icon={<CircleAlert />} title="Plan audio indisponible" tone="error">
          Les commandes sont associées, mais aucun monitoring ni aucune piste Room native ne sont déclarés prêts. La piste navigateur n’est pas coupée.
        </StatusNotice>
      ) : null}

      {connected && !handoffRecoveryRequired && engine.health?.audioPlane === "local_monitor" ? (
        <StatusNotice icon={<ShieldCheck />} title="Retour local uniquement" tone="warning">
          Le moteur peut traiter le casque, mais le pont audio de cette Room n’est pas prêt. La piste navigateur reste la seule piste publiée.
        </StatusNotice>
      ) : null}

      {connected ? <>
      <div className="voice-fx-engine__provider-block">
        <div className="voice-fx-engine__section-heading">
          <span><Sparkles aria-hidden="true" /><strong>Moteur vocal</strong></span>
          <button
            type="button"
            className="voice-fx-engine__power"
            aria-pressed={draft.enabled}
            disabled={!selectedReady || !completeChain || busy}
            onClick={() => { void persist({ ...draft, enabled: !draft.enabled }); }}
          >
            <i /> {draft.enabled ? "ACTIF" : "INACTIF"}
          </button>
        </div>

        <div className="voice-fx-engine__providers" role="group" aria-label="Moteur de correction vocale">
          {PROVIDERS.map((provider) => {
            const descriptor = providerDescriptors[provider.id];
            const status = pluginStatus(descriptor, connected);
            const ready = connected && pluginReady(descriptor);
            return (
              <button
                type="button"
                key={provider.id}
                className="voice-fx-engine__provider"
                aria-pressed={draft.provider === provider.id}
                disabled={!ready || busy}
                onClick={() => { void persist({ ...draft, provider: provider.id }); }}
                title={status.detail}
              >
                <span><strong>{provider.name}</strong><small>{provider.caption}</small></span>
                <em data-tone={status.tone}>{status.tone === "ready" ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{status.label}</em>
              </button>
            );
          })}
        </div>

        <div className="voice-fx-engine__provider-status">
          <p className="voice-fx-engine__provider-detail" data-tone={selectedStatus.tone}>
            {selectedStatus.tone === "ready" ? <ShieldCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            {selectedStatus.detail}
          </p>
          {connected && !selectedReady ? (
            <button type="button" onClick={() => { void engine.refresh(); }} disabled={busy}>
              <RefreshCw aria-hidden="true" /> Actualiser
            </button>
          ) : null}
        </div>
      </div>

      <div className="voice-fx-engine__controls" aria-disabled={!controlsReady}>
        <label className="voice-fx-engine__field voice-fx-engine__field--wide">
          <span>Preset MeeWav</span>
          <select value={draft.preset} disabled={!controlsReady} onChange={(event) => applyPreset(event.currentTarget.value as VoicePreset)}>
            {(Object.keys(PRESETS) as VoicePreset[]).map((preset) => <option key={preset}>{preset}</option>)}
          </select>
          <small>Configuration MeeWav, indépendante des presets propriétaires.</small>
        </label>

        <label className="voice-fx-engine__field">
          <span>Tonalité</span>
          <select value={draft.key} disabled={!controlsReady} onChange={(event) => { void persist({ ...draft, key: event.currentTarget.value as MusicalKey }); }}>
            {MUSICAL_KEYS.map((key) => <option key={key}>{key}</option>)}
          </select>
        </label>

        <label className="voice-fx-engine__field">
          <span>Gamme</span>
          <select value={draft.scale} disabled={!controlsReady} onChange={(event) => { void persist({ ...draft, scale: event.currentTarget.value as MusicalScale }); }}>
            {(Object.keys(SCALE_LABELS) as MusicalScale[]).map((scale) => <option key={scale} value={scale}>{SCALE_LABELS[scale]}</option>)}
          </select>
        </label>

        <div className="voice-fx-engine__ranges">
          <RangeControl label="Correction" value={draft.correctionAmount} disabled={!controlsReady} onDraft={(value) => setDraft((current) => ({ ...current, correctionAmount: value }))} onCommit={(value) => { void persist({ ...draft, correctionAmount: value }); }} />
          <RangeControl label="Compression" value={draft.compressionAmount} disabled={!controlsReady} onDraft={(value) => setDraft((current) => ({ ...current, compressionAmount: value }))} onCommit={(value) => { void persist({ ...draft, compressionAmount: value }); }} />
          <RangeControl label="Reverb" value={draft.reverbAmount} disabled={!controlsReady} onDraft={(value) => setDraft((current) => ({ ...current, reverbAmount: value }))} onCommit={(value) => { void persist({ ...draft, reverbAmount: value }); }} />
        </div>
      </div>

      <div className="voice-fx-engine__monitor">
        <div className="voice-fx-engine__monitor-heading">
          <span><Headphones aria-hidden="true" /><span><strong>Retour casque</strong><small>Monitoring local, sans détour réseau</small></span></span>
          <button type="button" className="voice-fx-engine__monitor-switch" aria-pressed={Boolean(engine.monitoring?.enabled)} disabled={!monitoringAvailable || busy} onClick={() => { void toggleMonitoring(); }}>
            <i /> {engine.monitoring?.enabled ? "ON" : "OFF"}
          </button>
        </div>

        <div className="voice-fx-engine__meters" aria-label="Niveaux audio mesurés">
          <div><span><Mic2 aria-hidden="true" /> Entrée</span><i><b style={{ width: `${meterPercent(inputMeter?.peakDb)}%` }} data-clipping={inputMeter?.clipping || undefined} /></i><output>{inputMeter ? `${inputMeter.peakDb.toFixed(1)} dB` : "—"}</output></div>
          <div><span><AudioLines aria-hidden="true" /> Sortie</span><i><b style={{ width: `${meterPercent(outputMeter?.peakDb)}%` }} data-clipping={outputMeter?.clipping || undefined} /></i><output>{outputMeter ? `${outputMeter.peakDb.toFixed(1)} dB` : "—"}</output></div>
        </div>

        <footer className="voice-fx-engine__footer">
          <div className="voice-fx-engine__latency" data-tone={latency.tone}>
            <Activity aria-hidden="true" /><span><small>LATENCE MONITORING</small><strong>{latency.value} · {latency.label}</strong></span>
          </div>
          <button type="button" className="voice-fx-engine__test" disabled={!monitoringAvailable || busy} onClick={() => { void toggleMonitoring(); }}>
            <Headphones aria-hidden="true" /> {engine.monitoring?.enabled ? "Arrêter le test" : "Tester ma voix"}
          </button>
        </footer>
      </div>
      </> : null}

      {actionError ? <p className="voice-fx-engine__error" role="alert"><CircleAlert aria-hidden="true" />{actionError}</p> : null}
    </section>
  );
}

export default VoiceFxEnginePanel;
