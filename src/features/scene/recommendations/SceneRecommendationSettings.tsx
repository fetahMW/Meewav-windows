import { ArrowLeft, History, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { trackSceneAnalytics } from "../sceneAnalytics";
import {
  readSceneRecommendationPreferences,
  resetSceneRecommendationPreferences,
  writeSceneRecommendationPreferences,
  type SceneRecommendationPreferences,
} from "./sceneRecommendationPreferences";
import "./scene-recommendation-settings.css";

const STYLE_OPTIONS = [
  "Rap", "Soul", "Jazz", "Afrobeat", "Amapiano", "Raï", "Pop", "Rock",
  "Électro", "House", "Reggae", "Classique",
] as const;

type Props = {
  onBack: () => void;
};

export default function SceneRecommendationSettings({ onBack }: Props) {
  const [preferences, setPreferences] = useState(readSceneRecommendationPreferences);
  const [message, setMessage] = useState("");

  const commit = (next: SceneRecommendationPreferences, reason: string) => {
    setPreferences(writeSceneRecommendationPreferences(next));
    setMessage("Réglages enregistrés sur cet appareil.");
    trackSceneAnalytics({ event: "filter_applied", reason });
  };

  return (
    <section className="scene-recommendation-settings" aria-labelledby="scene-recommendation-title">
      <header>
        <button type="button" onClick={onBack}><ArrowLeft /> La Scène</button>
        <div>
          <span><Sparkles /> Recommandations</span>
          <h1 id="scene-recommendation-title">Garde le contrôle de ce que tu découvres.</h1>
          <p>La popularité, le grade et le prix d’un jeton ne suffisent jamais à classer une création.</p>
        </div>
        <small><ShieldCheck /> Réglages privés</small>
      </header>

      <div className="scene-recommendation-settings__grid">
        <section>
          <h2>Personnalisation</h2>
          <label>
            <span><strong>Adapter les recommandations</strong><small>Affinités, diversité, fraîcheur et satisfaction explicite.</small></span>
            <input
              type="checkbox"
              checked={preferences.personalizationEnabled}
              onChange={(event) => commit({
                ...preferences,
                personalizationEnabled: event.currentTarget.checked,
              }, "personalization")}
            />
          </label>
          <label>
            <span><strong>Utiliser mon historique La Scène</strong><small>Tu peux le suspendre sans supprimer tes playlists.</small></span>
            <input
              type="checkbox"
              checked={preferences.historyEnabled}
              onChange={(event) => commit({
                ...preferences,
                historyEnabled: event.currentTarget.checked,
              }, "history")}
            />
          </label>
        </section>

        <section>
          <h2>Styles que tu veux explorer davantage</h2>
          <div className="scene-recommendation-settings__styles">
            {STYLE_OPTIONS.map((style) => {
              const active = preferences.preferredStyles.includes(style);
              return (
                <button
                  key={style}
                  type="button"
                  aria-pressed={active}
                  onClick={() => commit({
                    ...preferences,
                    preferredStyles: active
                      ? preferences.preferredStyles.filter((entry) => entry !== style)
                      : [...preferences.preferredStyles, style],
                  }, `style:${style}`)}
                >
                  {style}
                </button>
              );
            })}
          </div>
        </section>

        <section className="scene-recommendation-settings__reset">
          <History aria-hidden="true" />
          <div><h2>Repartir sur une base neutre</h2><p>Efface les préférences locales de recommandation, sans toucher à tes suivis ni à tes playlists.</p></div>
          <button type="button" onClick={() => {
            setPreferences(resetSceneRecommendationPreferences());
            setMessage("Recommandations locales réinitialisées.");
            trackSceneAnalytics({ event: "filter_applied", reason: "recommendations_reset" });
          }}><RefreshCcw /> Réinitialiser</button>
        </section>
      </div>
      <p className="scene-recommendation-settings__status" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
