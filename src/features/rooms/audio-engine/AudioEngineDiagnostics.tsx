import { Activity, Cable, Cpu, PlugZap, RefreshCw, RotateCcw, ShieldCheck, Unplug } from "lucide-react";
import { useAudioEngine } from "./AudioEngineContext";
import "./audio-engine-diagnostics.css";

const STATUS_LABELS = {
  idle: "Au repos",
  detecting: "Détection locale",
  pairing: "Association sécurisée",
  connecting: "Connexion",
  connected: "Connecté",
  incompatible: "Version incompatible",
  unavailable: "Indisponible",
  error: "Erreur",
  fallback: "Web Audio local",
} as const;

function meterWidth(db: number) {
  return `${Math.max(0, Math.min(100, ((db + 72) / 72) * 100))}%`;
}

export default function AudioEngineDiagnostics() {
  const engine = useAudioEngine();
  const busy = engine.status === "detecting" || engine.status === "pairing" || engine.status === "connecting";
  const monitoringAvailable = engine.status === "connected" && engine.health?.audioPlane !== "unavailable";
  const meters = [...(engine.meterFrame?.input ?? []), ...(engine.meterFrame?.output ?? [])];

  return (
    <main className="audio-engine-diagnostics">
      <header className="audio-engine-diagnostics__hero">
        <span><Cpu aria-hidden="true" /></span>
        <div>
          <small>INTERNE · ROOMS</small>
          <h1>MeeWav Audio Engine</h1>
          <p>Diagnostic du pont local sécurisé entre Rooms et le moteur audio desktop.</p>
        </div>
        <strong data-status={engine.status}><i /> {STATUS_LABELS[engine.status]}</strong>
      </header>

      <section className="audio-engine-diagnostics__actions" aria-label="Commandes du moteur local">
        <button type="button" onClick={() => { void engine.detect(); }} disabled={busy}><RefreshCw aria-hidden="true" /> Détecter</button>
        <button type="button" className="is-primary" onClick={() => { void engine.launchAndPair(); }} disabled={busy}><PlugZap aria-hidden="true" /> Lancer et associer</button>
        <button type="button" onClick={() => { void engine.useWebAudioFallback("Fallback choisi manuellement depuis le diagnostic."); }} disabled={busy}><RotateCcw aria-hidden="true" /> Utiliser Web Audio</button>
        {engine.status === "connected" ? <button type="button" onClick={() => { void engine.refresh(); }} disabled={busy}><Activity aria-hidden="true" /> Actualiser</button> : null}
        {engine.status === "connected" ? <button type="button" onClick={() => { void engine.setMonitoring(!engine.monitoring?.enabled).catch(() => undefined); }} disabled={busy || !monitoringAvailable}><Cable aria-hidden="true" /> {engine.monitoring?.enabled ? "Couper le retour" : "Retour casque"}</button> : null}
        {engine.transport === "native" ? <button type="button" className="is-danger" onClick={() => { void engine.disconnect(); }}><Unplug aria-hidden="true" /> Déconnecter</button> : null}
      </section>

      {engine.error ? <div className="audio-engine-diagnostics__notice is-error" role="alert"><Cable aria-hidden="true" /><span><strong>Connexion locale</strong>{engine.error}</span></div> : null}
      {engine.transport === "web_audio" ? <div className="audio-engine-diagnostics__notice"><ShieldCheck aria-hidden="true" /><span><strong>Fallback explicite actif</strong>{engine.fallbackReason} La chaîne Web Audio intégrée à La Place reste utilisée ; aucun plugin desktop n’est simulé.</span></div> : null}

      <section className="audio-engine-diagnostics__summary" aria-label="État de compatibilité">
        <article><small>TRANSPORT</small><strong>{engine.transport === "native" ? "Desktop natif" : engine.transport === "web_audio" ? "Web Audio" : "Non sélectionné"}</strong><span>{engine.endpoint ?? "Endpoint non exposé"}</span></article>
        <article><small>API / MOTEUR</small><strong>{engine.health ? `${engine.health.apiVersion} · ${engine.health.engineVersion}` : "—"}</strong><span>{engine.health ? `${engine.health.status === "degraded" ? "Service dégradé" : "Service opérationnel"} · ${engine.health.audioPlane}` : "En attente"}</span></article>
        <article><small>COMPATIBILITÉ</small><strong>{engine.compatibility?.compatible ? "Compatible" : engine.compatibility ? "Incompatible" : "—"}</strong><span>{engine.compatibility?.reason ?? "Contrôle après association"}</span></article>
        <article><small>NIVEAUX</small><strong>{engine.metersStatus}</strong><span>{engine.meterFrame ? `Trame ${engine.meterFrame.sequence}` : "Aucune donnée fabriquée"}</span></article>
      </section>

      <section className="audio-engine-diagnostics__grid">
        <article className="audio-engine-diagnostics__panel">
          <header><span><Cable aria-hidden="true" /><strong>Périphériques</strong></span><small>{engine.devices.length}</small></header>
          <div className="audio-engine-diagnostics__list">
            {engine.devices.length ? engine.devices.map((device) => (
              <div key={device.id}><span><strong>{device.label}</strong><small>{device.kind.replace(/_/gu, " ")} · {device.channels} canaux</small></span><em data-state={device.status}>{device.selected ? "Sélectionné" : device.status}</em></div>
            )) : <p>Aucun périphérique transmis par le moteur.</p>}
          </div>
        </article>

        <article className="audio-engine-diagnostics__panel">
          <header><span><Cpu aria-hidden="true" /><strong>Plugins détectés</strong></span><small>{engine.plugins.length}</small></header>
          <div className="audio-engine-diagnostics__list">
            {engine.plugins.length ? engine.plugins.map((plugin) => (
              <div key={plugin.id}><span><strong>{plugin.name}</strong><small>{plugin.vendor} · {plugin.format} · {plugin.version}</small></span><em data-state={plugin.status}>{plugin.status}</em></div>
            )) : <p>Aucun plugin déclaré. MeeWav n’en simule aucun.</p>}
          </div>
        </article>

        <article className="audio-engine-diagnostics__panel is-wide">
          <header><span><Activity aria-hidden="true" /><strong>Chaîne canonique active</strong></span><small>{engine.chain ? "5 blocs validés" : "—"}</small></header>
          <div className="audio-engine-diagnostics__chain">
            {engine.chain ? (
              <>
                <div><small>01</small><strong>Entrée</strong><span>{engine.chain.inputGainDb.toFixed(1)} dB</span></div>
                <div className={engine.chain.vocalTuning.enabled ? "" : "is-bypassed"}><small>02</small><strong>Correction vocale</strong><span>{engine.chain.vocalTuning.provider} · {engine.chain.vocalTuning.key} {engine.chain.vocalTuning.scale}</span>{engine.chain.vocalTuning.enabled ? null : <em>Bypass</em>}</div>
                <div><small>03</small><strong>Compresseur</strong><span>{engine.chain.compressor.provider} · {Math.round(engine.chain.compressor.amount * 100)} %</span></div>
                <div><small>04</small><strong>Réverbération</strong><span>{engine.chain.reverb.provider} · {Math.round(engine.chain.reverb.amount * 100)} %</span></div>
                <div><small>05</small><strong>Master</strong><span>{engine.chain.masterGainDb.toFixed(1)} dB</span></div>
              </>
            ) : <p>Aucune chaîne native reçue.</p>}
          </div>
        </article>

        <article className="audio-engine-diagnostics__panel is-wide">
          <header><span><Activity aria-hidden="true" /><strong>Niveaux temps réel</strong></span><small>{engine.metersStatus}</small></header>
          <div className="audio-engine-diagnostics__meters">
            {meters.length ? meters.map((meter) => (
              <div key={meter.id}><strong>{meter.id}</strong><span><i style={{ width: meterWidth(meter.peakDb) }} data-clipping={meter.clipping || undefined} /></span><em>{meter.peakDb.toFixed(1)} dB</em></div>
            )) : <p>Aucune trame reçue. Aucun niveau de démonstration n’est injecté.</p>}
          </div>
        </article>
      </section>
    </main>
  );
}
