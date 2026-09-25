import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { roomToolsRepository } from "./roomTools.service";
import { WAVE_TEST_PRODUCTIONS } from "./waveTestPacks";
import { useRoomTools } from "./useRoomTools";
import { useWaveTransport } from "../wave-transport/WaveTransportProvider";
import "./wave-simulation.css";

export default function WaveSimulationPicker({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state } = useRoomTools({ roomType: "wave", roomId, role: "host", accountId: "puff-wave-host", source: "demo" });
  const transport = useWaveTransport();
  const select = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      transport?.pause();
      await transport?.select(null);
      if (transport) {
        transport.engine.setRegion(0, 8, false);
        transport.engine.seek(0);
      }
      await roomToolsRepository.simulateWaveProduction(roomId, id);
      setOpen(false);
    } catch {
      setError("Impossible de charger cette production. Réessaie.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="wave-simulation" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" className="wave-simulation__trigger" aria-expanded={open} onClick={() => setOpen(!open)}>
      <FlaskConical size={16} aria-hidden="true" /> Simulation
    </button>
    {open && <div className="wave-simulation__panel" role="group" aria-label="Choisir une production de simulation">
      <strong>Production de test</strong>
      <small>Une base host et 6 boucles en attente. Chaque choix relance le test.</small>
      {WAVE_TEST_PRODUCTIONS.map((production) => <button type="button" key={production.id} disabled={busy || !state}
        aria-label={`${production.id} ${production.bpm} BPM · ${production.key}`}
        aria-pressed={state?.wave?.title === `${production.id} · Simulation`} onClick={() => void select(production.id)}>
        <span>{production.id}</span><small>{production.bpm} BPM · {production.key}</small>
      </button>)}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
