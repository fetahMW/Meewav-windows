import {
  ChevronRight,
  ClipboardSignature,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  WalletCards,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { spaceModules, type DemoProfile, type SpaceModuleId } from "../profile.data";
import {
  isProfilePrivateDemoEnabled,
  profilePrivateRepository,
  type ProfilePrivateDashboard,
} from "../profile.private.service";
import ProfilePrivateModuleView, { type PrivateQuickAction } from "./ProfilePrivateModuleView";

type ProfileSpaceViewProps = {
  profile: DemoProfile;
  onEditProfile: () => void;
  onViewerPreview: () => void;
  onOpenQuickAction: (action: PrivateQuickAction) => void;
  onToast: (message: string) => void;
};

const moduleIcons: Record<SpaceModuleId, LucideIcon> = {
  wallet: WalletCards,
  transactions: ReceiptText,
  contracts: ClipboardSignature,
  hardware: Wrench,
  security: ShieldCheck,
  organization: UsersRound,
};

const privateModuleSlugs: Record<SpaceModuleId, string> = {
  wallet: "wallet",
  transactions: "transactions",
  contracts: "contracts",
  hardware: "equipment",
  security: "security",
  organization: "organization",
};

const privateModuleFromSlug: Record<string, SpaceModuleId> = {
  ...Object.fromEntries(Object.entries(privateModuleSlugs).map(([moduleId, slug]) => [slug, moduleId])),
  portefeuille: "wallet",
  contrats: "contracts",
  materiel: "hardware",
  securite: "security",
  organisation: "organization",
};

const visibilityLabels = {
  bio: "Bio publique",
  role: "Rôle artistique",
  grade: "Grade et niveau",
  collab: "Bouton Collaborer",
  viewer: "Menu Viewer",
};

type PrivateDashboardState =
  | { status: "loading"; dashboard: null; error: null; isDemo: false }
  | { status: "ready"; dashboard: ProfilePrivateDashboard; error: null; isDemo: false }
  | { status: "demo"; dashboard: null; error: null; isDemo: true }
  | { status: "error"; dashboard: null; error: string; isDemo: false };

const formatCompactCurrency = (value: number, currency = "EUR") => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency,
  maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
}).format(value);

export default function ProfileSpaceView({
  profile,
  onEditProfile,
  onViewerPreview,
  onOpenQuickAction,
  onToast,
}: ProfileSpaceViewProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dashboardState, setDashboardState] = useState<PrivateDashboardState>({
    status: "loading",
    dashboard: null,
    error: null,
    isDemo: false,
  });
  const [visibility, setVisibility] = useState(() => ({
    bio: typeof profile.publicProfilePreferences.show_bio === "boolean" ? profile.publicProfilePreferences.show_bio : true,
    role: profile.visibility.role,
    grade: profile.visibility.grade,
    collab: profile.visibility.collab,
    viewer: profile.visibility.viewerMenu,
  }));

  const routeSegments = location.pathname.split("/").filter(Boolean);
  const routeSlug = routeSegments[routeSegments.length - 1] ?? "";
  const activeModule = privateModuleFromSlug[routeSlug] ?? "wallet";

  const loadPrivateDashboard = useCallback(async () => {
    if (isProfilePrivateDemoEnabled()) {
      setDashboardState({ status: "demo", dashboard: null, error: null, isDemo: true });
      return;
    }
    if (!user) {
      setDashboardState({ status: "error", dashboard: null, error: "Ta session a expiré. Reconnecte-toi pour ouvrir cet espace privé.", isDemo: false });
      return;
    }

    setDashboardState({ status: "loading", dashboard: null, error: null, isDemo: false });
    try {
      const dashboard = await profilePrivateRepository.getOwnerDashboard(user.id);
      setDashboardState({ status: "ready", dashboard, error: null, isDemo: false });
    } catch (error) {
      setDashboardState({
        status: "error",
        dashboard: null,
        error: error instanceof Error ? error.message : "Les données privées n’ont pas pu être chargées.",
        isDemo: false,
      });
    }
  }, [user]);

  useEffect(() => {
    void loadPrivateDashboard();
  }, [loadPrivateDashboard]);

  useEffect(() => {
    if (!privateModuleFromSlug[routeSlug]) navigate("/profile/private/wallet", { replace: true });
  }, [navigate, routeSlug]);

  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) return undefined;

    const resetOuterScroll = () => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    resetOuterScroll();
    const frame = window.requestAnimationFrame(resetOuterScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const navigatePrivate = (path: string) => {
    if (window.matchMedia("(min-width: 768px)").matches) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const startViewTransition = (document as Document & {
      startViewTransition?: (callback: () => void) => void;
    }).startViewTransition;
    if (startViewTransition) startViewTransition.call(document, () => navigate(path));
    else navigate(path);
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(min-width: 768px)").matches) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };

  const openModule = (moduleId: SpaceModuleId) => navigatePrivate(`/profile/private/${privateModuleSlugs[moduleId]}`);

  const renderModuleRailItem = (moduleId: SpaceModuleId) => {
    const module = spaceModules.find((item) => item.id === moduleId);
    if (!module) return null;
    const Icon = moduleIcons[module.id];
    const isActive = activeModule === module.id;
    const dashboard = dashboardState.dashboard;
    const railValue = dashboardState.status === "loading"
      ? "—"
      : dashboard
        ? module.id === "wallet"
          ? formatCompactCurrency(dashboard.wallet.activityNet, dashboard.wallet.currency)
          : module.id === "transactions"
            ? String(dashboard.transactions.length)
            : module.id === "contracts"
              ? `${dashboard.contracts.filter((item) => /sign|pending|attente/i.test(item.status)).length} à traiter`
              : module.id === "hardware"
                ? `${dashboard.hardware.length} éléments`
                : module.id === "security"
                  ? dashboard.security.mfaVerifiedFactors > 0 ? "MFA actif" : "À renforcer"
                  : `${dashboard.organizationInvitations.length} invitations`
        : module.id === "contracts" ? module.status : module.metric;
    return (
      <button
        key={module.id}
        type="button"
        className={`profile-private-module-rail__item is-${module.id} ${isActive ? "is-active" : ""}`}
        style={{ "--module-accent": module.accent, viewTransitionName: `private-module-nav-${module.id}` } as React.CSSProperties}
        aria-current={isActive ? "page" : undefined}
        aria-controls="profile-private-module-detail"
        aria-label={`${module.label} · ${module.detail} · ${railValue}`}
        onClick={() => openModule(module.id)}
      >
        <span className="profile-private-module-rail__icon"><Icon size={18} /></span>
        <span className="profile-private-module-rail__copy"><strong>{module.label}</strong></span>
        <span className="profile-private-module-rail__metric"><strong>{railValue}</strong></span>
        <ChevronRight className="profile-private-module-rail__chevron" size={14} />
      </button>
    );
  };

  return (
    <div className="profile-view profile-space-view is-module" aria-label="Espace privé du profil">
      <header className="profile-private-shell-header is-navigationless">
        <h2>Espace privé du profil</h2>
      </header>

      <div className="profile-private-content-stage">
        <div className="profile-private-master-detail has-active-module">
          <aside className="profile-private-module-rail">
            <div className="profile-private-module-rail__heading">
              <span className="profile-kicker"><LayoutDashboard size={13} /> Outils privés</span>
            </div>
            <nav aria-label="Modules privés">
              {spaceModules.map((module) => renderModuleRailItem(module.id))}
            </nav>
          </aside>

          <main id="profile-private-module-detail" className="profile-private-master-detail__surface" aria-live="polite">
            <div className="profile-private-master-detail__transition" key={activeModule}>
              <ProfilePrivateModuleView
                moduleId={activeModule}
                presentation="embedded"
                profile={profile}
                dashboard={dashboardState.dashboard}
                dataStatus={dashboardState.status}
                dataError={dashboardState.error}
                allowDemoActions={dashboardState.isDemo}
                onRetry={() => void loadPrivateDashboard()}
                profileVisibility={visibility}
                onToggleProfileVisibility={(id) => {
                  setVisibility((current) => {
                    const nextValue = !current[id];
                    onToast(`${visibilityLabels[id]} ${nextValue ? "activé" : "masqué"}`);
                    return { ...current, [id]: nextValue };
                  });
                }}
                onEditProfile={onEditProfile}
                onViewerPreview={onViewerPreview}
                onBack={() => openModule("wallet")}
                onOpenQuickAction={onOpenQuickAction}
                onToast={onToast}
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
