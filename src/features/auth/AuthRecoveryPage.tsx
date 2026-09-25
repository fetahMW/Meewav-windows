import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle, Loader, Lock, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getAuthErrorMessage } from "./auth.service";
import { useAuth } from "./AuthContext";

type AuthRecoveryPageProps = {
  mode: "request" | "update";
};

export default function AuthRecoveryPage({ mode }: AuthRecoveryPageProps) {
  const navigate = useNavigate();
  const { status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "update" && password !== confirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (mode === "update" && password.length < 8) {
      setError("Choisis un mot de passe d’au moins 8 caractères.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "request") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
        if (resetError) throw resetError;
        setSuccess("Si ce compte existe, un lien sécurisé vient d’être envoyé.");
      } else {
        if (status !== "authenticated") {
          throw new Error("Ce lien a expiré. Demande un nouveau lien de réinitialisation.");
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setSuccess("Ton mot de passe a été mis à jour.");
        window.setTimeout(() => navigate("/globe", { replace: true }), 700);
      }
    } catch (recoveryError: unknown) {
      setError(getAuthErrorMessage(recoveryError, "La demande n’a pas pu être traitée."));
    } finally {
      setLoading(false);
    }
  };

  const isUpdate = mode === "update";

  return (
    <main className="auth-action-page">
      <div className="auth-action-background" />
      <section className="auth-action-card">
        <div className="auth-action-brand">MW</div>
        <h1>{isUpdate ? "Nouveau mot de passe" : "Retrouve ton compte"}</h1>
        <p>
          {isUpdate
            ? "Choisis un nouveau mot de passe pour sécuriser ton espace."
            : "Nous t’enverrons un lien de réinitialisation sécurisé."}
        </p>

        {error && (
          <div className="auth-action-message is-error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="auth-action-message is-success" role="status">
            <CheckCircle size={17} />
            <span>{success}</span>
          </div>
        )}

        <form className="auth-action-form" onSubmit={handleSubmit}>
          {isUpdate ? (
            <>
              <label className="input-row">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Nouveau mot de passe"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
              </label>
              <label className="input-row">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Confirmer le mot de passe"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
              </label>
            </>
          ) : (
            <label className="input-row">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Adresse e-mail"
                autoComplete="email"
                disabled={loading}
                required
              />
            </label>
          )}

          <button className="primary-button" type="submit" disabled={loading || (isUpdate && status === "loading")}>
            {loading ? (
              <span className="button-loader"><Loader size={18} className="spinner-icon" />Traitement…</span>
            ) : isUpdate ? "Enregistrer" : "Envoyer le lien"}
          </button>
        </form>

        <Link className="auth-action-secondary" to="/auth">Retour à la connexion</Link>
      </section>
    </main>
  );
}
