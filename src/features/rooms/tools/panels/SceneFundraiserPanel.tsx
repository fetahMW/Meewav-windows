import { CalendarDays, Check, Eye, EyeOff, Flag, HeartHandshake, Pencil, Save, Sparkles, Square } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { RoomToolsCommand, SceneFundraiserState, SceneState } from "../roomTools.types";
import { ToolPanelHeader } from "./RoomToolPanelPrimitives";

function euros(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
type FundraiserDraft = Pick<SceneFundraiserState, "title" | "beneficiary" | "targetAmount" | "description" | "imageUrl" | "endAt">;
function campaignDraft(campaign: SceneFundraiserState): FundraiserDraft {
  return { title: campaign.title, beneficiary: campaign.beneficiary, targetAmount: campaign.targetAmount, description: campaign.description, imageUrl: campaign.imageUrl, endAt: campaign.endAt };
}
function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function SceneFundraiserPanel({ scene, disabled, execute }: { scene: SceneState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const campaign = scene.fundraiser;
  const [draft, setDraft] = useState<FundraiserDraft>(() => campaignDraft(campaign));
  const [editing, setEditing] = useState(campaign.status === "draft");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const { title, beneficiary, targetAmount, description, imageUrl, endAt } = campaign;
  useEffect(() => setDraft({ title, beneficiary, targetAmount, description, imageUrl, endAt }), [title, beneficiary, targetAmount, description, imageUrl, endAt]);
  const preview = editing ? draft : campaign;
  const percentage = preview.targetAmount ? Math.min(100, Math.round(campaign.collectedAmount / preview.targetAmount * 100)) : 0;
  const complete = Boolean(draft.title.trim() && draft.beneficiary.trim() && Number.isFinite(draft.targetAmount) && draft.targetAmount > 0 && draft.targetAmount <= 1_000_000);
  const locked = disabled || pending;
  const updateDraft = (patch: Partial<FundraiserDraft>) => { setSaved(false); setDraft((current) => ({ ...current, ...patch })); };
  const patchCampaign = async (patch: Extract<RoomToolsCommand, { type: "scene.fundraiser.patch" }>["patch"]) => {
    if (locked) return false;
    setPending(true);
    setError("");
    try {
      await execute({ type: "scene.fundraiser.patch", patch });
      return true;
    } catch {
      setError("La modification n’a pas été enregistrée. Réessayez.");
      return false;
    } finally {
      setPending(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    if (await patchCampaign(draft)) { setSaved(true); setEditing(false); }
  };
  const launch = async () => {
    if (!complete) return;
    if (await patchCampaign({ ...draft, status: "live", visibleInLive: true })) setEditing(false);
  };

  return <div className="room-tool-panel is-fundraiser scene-engagement">
    <ToolPanelHeader eyebrow="LE PUBLIC VOUS SOUTIENT" title="Cagnotte" description="Donnez un objectif à cette soirée." status={campaign.status === "live" ? "EN DIRECT" : campaign.status === "closed" ? "CLÔTURÉE" : "BROUILLON"} icon={<HeartHandshake />} />
    <section className={`scene-campaign${campaign.highlighted ? " is-highlighted" : ""}`} aria-label="Aperçu de la cagnotte">
      <header><span className="scene-engagement__eyebrow">{editing ? "APERÇU DES MODIFICATIONS" : "VOTRE OBJECTIF"}</span><span className="scene-engagement__badge">{campaign.visibleInLive && campaign.status !== "draft" ? <Eye /> : <EyeOff />}{campaign.visibleInLive && campaign.status !== "draft" ? "Visible" : "Masquée"}</span></header>
      {preview.imageUrl ? <img className="scene-campaign__cover" src={preview.imageUrl} alt="" /> : null}
      <div className="scene-campaign__title"><span>{preview.beneficiary || "Bénéficiaire à définir"}</span><h3>{preview.title || "Un projet à faire grandir"}</h3><p>{preview.description || "Présentez le projet que votre public peut soutenir."}</p></div>
      <div className="scene-campaign__amount"><strong>{euros(campaign.collectedAmount)}</strong><span>sur {euros(preview.targetAmount)}</span><b>{percentage}%</b></div>
      <div className="scene-campaign__progress" role="progressbar" aria-label="Objectif de la cagnotte" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percentage}%` }} /></div>
      <footer><span><HeartHandshake />{campaign.contributionCount} contribution{campaign.contributionCount > 1 ? "s" : ""}</span>{preview.endAt && Number.isFinite(new Date(preview.endAt).getTime()) ? <span><CalendarDays />Jusqu’au {new Date(preview.endAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span> : null}</footer>
    </section>
    {!campaign.paymentAvailable ? <p className="scene-engagement__availability"><HeartHandshake /><span>Les contributions sont indisponibles pour le moment.</span></p> : null}
    <section className="scene-campaign__live" aria-label="Diffusion de la cagnotte">
      {campaign.status !== "live" ? <button type="button" className="is-primary scene-campaign__launch" disabled={locked || !complete} onClick={() => void launch()}><Flag />{campaign.status === "closed" ? "Rouvrir la cagnotte" : "Lancer la cagnotte"}</button> : <div className="scene-campaign__live-actions"><button type="button" disabled={locked} onClick={() => void patchCampaign({ visibleInLive: !campaign.visibleInLive })}>{campaign.visibleInLive ? <EyeOff /> : <Eye />}{campaign.visibleInLive ? "Masquer du live" : "Afficher dans le live"}</button><button type="button" disabled={locked || !campaign.visibleInLive} aria-pressed={campaign.highlighted} onClick={() => void patchCampaign({ highlighted: !campaign.highlighted })}><Sparkles />{campaign.highlighted ? "Retirer la mise en avant" : "Mettre en avant"}</button></div>}
      <div className="scene-campaign__management"><button type="button" aria-expanded={editing} aria-controls="scene-campaign-editor" disabled={pending} onClick={() => { setDraft(campaignDraft(campaign)); setEditing((value) => !value); setSaved(false); }}><Pencil />{editing ? "Fermer l’édition" : "Modifier l’objectif"}</button>{campaign.status === "live" ? <button type="button" className="scene-campaign__close" disabled={locked} onClick={() => void patchCampaign({ status: "closed", visibleInLive: true, highlighted: false })}><Square />Clôturer</button> : campaign.status === "closed" ? <button type="button" disabled={locked} onClick={() => void patchCampaign({ visibleInLive: !campaign.visibleInLive })}>{campaign.visibleInLive ? <EyeOff /> : <Eye />}{campaign.visibleInLive ? "Masquer du live" : "Afficher dans le live"}</button> : null}</div>
    </section>
    {editing ? <form id="scene-campaign-editor" className="scene-campaign__form room-tool-form-grid" onSubmit={(event) => void save(event)}>
      <header className="is-wide"><strong>Votre objectif</strong><span>Ce que le public verra</span></header>
      <label className="room-tool-field is-wide">Titre<input required disabled={locked} maxLength={100} value={draft.title} placeholder="Ex. : financer notre prochain concert" onChange={(event) => updateDraft({ title: event.currentTarget.value })} /></label>
      <label className="room-tool-field">Bénéficiaire<input required disabled={locked} maxLength={100} value={draft.beneficiary} onChange={(event) => updateDraft({ beneficiary: event.currentTarget.value })} /></label>
      <label className="room-tool-field">Montant cible (€)<input required disabled={locked} type="number" min="1" max="1000000" value={draft.targetAmount || ""} onChange={(event) => updateDraft({ targetAmount: Number(event.currentTarget.value) })} /></label>
      <label className="room-tool-field is-wide">Description<textarea disabled={locked} rows={3} maxLength={500} value={draft.description} onChange={(event) => updateDraft({ description: event.currentTarget.value })} /></label>
      <details className="scene-engagement__details is-wide"><summary>Image et date de fin</summary><label className="room-tool-field">Image (URL)<input disabled={locked} type="url" maxLength={500} value={draft.imageUrl} placeholder="https://…" onChange={(event) => updateDraft({ imageUrl: event.currentTarget.value })} /></label><label className="room-tool-field">Date de fin<input disabled={locked} type="datetime-local" value={localDateTime(draft.endAt)} onChange={(event) => { const value = event.currentTarget.value; updateDraft({ endAt: value ? new Date(value).toISOString() : null }); }} /></label></details>
      <footer className="is-wide"><button type="button" disabled={pending} onClick={() => { setDraft(campaignDraft(campaign)); setEditing(false); }}>Annuler</button><button type="submit" className="is-primary" disabled={locked || !complete}><Save />{pending ? "Enregistrement…" : "Enregistrer"}</button></footer>
    </form> : null}
    {saved ? <p className="scene-engagement__saved" role="status"><Check />Objectif enregistré.</p> : null}
    {error ? <p className="scene-engagement__error" role="alert">{error}</p> : null}
  </div>;
}
