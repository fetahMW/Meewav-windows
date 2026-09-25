import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  AtSign,
  Globe,
  MessageSquare,
  Box,
  Play,
  Store,
  Rocket,
  ChevronLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  Loader,
  MapPin,
  ChevronRight,
  Music2,
  Search,
  ShieldCheck,
} from "lucide-react";
import "../styles/auth.css";
import PillarCard from "../components/PillarCard";
import AvatarSelectionPage from "./AvatarSelectionPage";
import HolographicOrbCTA from "../components/auth/HolographicOrbCTA";
import { AuthPanelChrome, SubtitleDivider, MidSeparator } from "../components/auth/AuthPanelChrome";
import { MON_GLOBE_ROUTE } from "../features/globe/monGlobeContract";
import { supabase } from "../lib/supabaseClient";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getAuthErrorMessage } from "../features/auth/auth.service";
import { getSafeAuthReturnRoute } from "../features/auth/authReturnRoute";
import {
  enableLocalAuthPreview,
  isLocalAuthPreviewAvailable,
  LOCAL_PREVIEW_FETAH_HOST,
} from "../features/auth/localAuthPreview";
import {
  loadMusicSceneCityIndex,
  loadMusicScenesForCity,
  resolveMusicSceneFromCoordinates,
  searchMusicSceneCityCatalog,
  type MusicScene,
  type MusicSceneCity,
} from "../features/auth/musicSceneSelection";
import {
  clearMusicSceneOnboardingPreview,
  getOnboardingAvatarIconId,
  saveMusicSceneOnboarding,
  type MusicSceneOnboardingPayload,
} from "../features/auth/musicSceneOnboardingContract";
import { prepareAuthenticatedMusicSceneArrival } from "../features/auth/musicSceneAuthenticatedArrival";
import { persistMusicSceneProfile } from "../features/auth/musicSceneProfilePersistence";
import {
  SCENE_NAME,
} from "../features/shorts/sceneContract";
import {
  SIGNUP_USERNAME_MAX_LENGTH,
  validateSignupCredentials,
} from "../features/auth/signupCredentialValidation";


const pillarsData = [
  { title: "Globe", description: "Les talents près de vous", icon: Globe },
  { title: "Messagerie", description: "Échanges et collaborations", icon: MessageSquare },
  { title: "Rooms", description: "La musique en direct", icon: Box },
  { title: SCENE_NAME, description: "Vidéos et créations", icon: Play },
  { title: "Marketplace", description: "Matériel et services", icon: Store },
  { title: "Tremplin", description: "Soutenez les talents", icon: Rocket },
];

type AuthMode = "login" | "signup";
type SocialProvider = "google" | "apple";

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = location.state as { returnTo?: unknown } | null;
  const queryReturnTo = new URLSearchParams(location.search).get("returnTo");
  const postLoginRoute = getSafeAuthReturnRoute(
    navigationState?.returnTo ? navigationState : { returnTo: queryReturnTo },
  );
  const localAuthPreviewAvailable = isLocalAuthPreviewAvailable();
  const [mode, setMode] = useState<AuthMode>("login");
  const [signupStep, setSignupStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingSocialProvider, setPendingSocialProvider] = useState<SocialProvider | null>(null);

  // Storing signup details
  const [selectedAvatarFile, setSelectedAvatar] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  // Music-scene localisation: a stable commune + IRIS scene, never a street address.
  const [sceneCities, setSceneCities] = useState<MusicSceneCity[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [selectedSceneCity, setSelectedSceneCity] = useState<MusicSceneCity | null>(null);
  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [sceneQuery, setSceneQuery] = useState("");
  const [sceneOptions, setSceneOptions] = useState<MusicScene[]>([]);
  const [selectedMusicScene, setSelectedMusicScene] = useState<MusicScene | null>(null);
  const [isScenePickerOpen, setIsScenePickerOpen] = useState(false);
  const [isSceneIndexLoading, setIsSceneIndexLoading] = useState(false);
  const [isSceneListLoading, setIsSceneListLoading] = useState(false);
  const [isVisibleAroundMe, setIsVisibleAroundMe] = useState(true);
  const [hasResolvedCurrentLocation, setHasResolvedCurrentLocation] = useState(false);
  const sceneLoadTokenRef = useRef(0);
  const sceneIndexRequestedRef = useRef(false);
  const [activeCitySuggestionIndex, setActiveCitySuggestionIndex] = useState(0);
  const [citySuggestionLimit, setCitySuggestionLimit] = useState(10);



  // Controlled input states
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // UX Feedback states
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const resetSignupDraft = () => {
    sceneLoadTokenRef.current += 1;
    sceneIndexRequestedRef.current = false;
    setSignupStep(1);
    setSelectedAvatar("");
    setSelectedRole("");
    setSignupUsername("");
    setSignupEmail("");
    setSignupPassword("");
    setSignupConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setPendingSocialProvider(null);
    setCityQuery("");
    setSelectedSceneCity(null);
    setIsCityPickerOpen(false);
    setSceneQuery("");
    setSceneOptions([]);
    setSelectedMusicScene(null);
    setIsScenePickerOpen(false);
    setIsSceneListLoading(false);
    setIsVisibleAroundMe(true);
    setHasResolvedCurrentLocation(false);
    setActiveCitySuggestionIndex(0);
    setCitySuggestionLimit(10);
    setIsPulsing(false);
  };

  const currentStep = mode === "login" ? 0 : signupStep;
  const slideIndex = currentStep === 3 ? 2 : currentStep;

  // Premium pulse states to transition between step 2 and step 3 in place
  const [isPulsing, setIsPulsing] = useState(false);

  const deferredCityQuery = useDeferredValue(cityQuery);
  const cityCatalogSearch = useMemo(
    () => searchMusicSceneCityCatalog(sceneCities, deferredCityQuery, citySuggestionLimit),
    [citySuggestionLimit, deferredCityQuery, sceneCities],
  );
  const citySuggestions = cityCatalogSearch.items;
  const isCitySearchPending = deferredCityQuery !== cityQuery;

  useEffect(() => {
    setActiveCitySuggestionIndex(0);
    setCitySuggestionLimit(10);
  }, [deferredCityQuery, isCityPickerOpen]);

  useEffect(() => {
    if (!isCityPickerOpen) return;
    const activeCity = citySuggestions[activeCitySuggestionIndex];
    if (!activeCity) return;
    document
      .getElementById(`music-scene-city-option-${activeCity.communeCode}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeCitySuggestionIndex, citySuggestions, isCityPickerOpen]);

  const filteredSceneOptions = useMemo(() => {
    const normalizedQuery = sceneQuery
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
      .trim();
    if (!normalizedQuery || selectedMusicScene?.label === sceneQuery) return sceneOptions;
    return sceneOptions.filter((scene) => scene.label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
      .includes(normalizedQuery));
  }, [sceneOptions, sceneQuery, selectedMusicScene]);

  const handlePickerChromeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement
      || (target instanceof Element && target.closest(".scene-picker-menu"))
    ) return;

    // Clicking the field chrome or its chevron must never place a text caret
    // inside the search input.
    event.preventDefault();
  };

  const handleCityPickerFieldClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      loading
      || isSceneIndexLoading
      || (target instanceof Element && target.closest(".scene-picker-menu, .scene-picker-overlay"))
    ) return;

    setIsScenePickerOpen(false);
    if (target instanceof HTMLInputElement) {
      setIsCityPickerOpen(true);
      return;
    }

    event.currentTarget.querySelector("input")?.blur();
    setActiveCitySuggestionIndex(0);
    setIsCityPickerOpen((isOpen) => !isOpen);
  };

  const handleScenePickerFieldClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      loading
      || !selectedSceneCity
      || isSceneListLoading
      || (target instanceof Element && target.closest(".scene-picker-menu, .scene-picker-overlay"))
    ) return;

    setIsCityPickerOpen(false);
    if (target instanceof HTMLInputElement) {
      setIsScenePickerOpen(true);
      return;
    }

    event.currentTarget.querySelector("input")?.blur();
    setIsScenePickerOpen((isOpen) => !isOpen);
  };

  const handleStepChangeWithPulse = (targetStep: number) => {
    setIsPulsing(true);
    // Smoothly toggle content at the peak of the pulse transition
    setTimeout(() => {
      setSignupStep(targetStep);
    }, 220);
    setTimeout(() => {
      setIsPulsing(false);
    }, 720);
  };

  useEffect(() => {
    if (
      mode !== "signup"
      || signupStep !== 3
      || sceneCities.length > 0
      || isSceneIndexLoading
      || sceneIndexRequestedRef.current
    ) return;
    sceneIndexRequestedRef.current = true;
    setIsSceneIndexLoading(true);
    loadMusicSceneCityIndex()
      .then(setSceneCities)
      .catch(() => setAuthError("Le répertoire des scènes est momentanément indisponible."))
      .finally(() => setIsSceneIndexLoading(false));
  }, [isSceneIndexLoading, mode, sceneCities.length, signupStep]);

  const selectSceneCity = async (city: MusicSceneCity, preferredZoneId?: string) => {
    const loadToken = ++sceneLoadTokenRef.current;
    if (!preferredZoneId) setHasResolvedCurrentLocation(false);
    setSelectedSceneCity(city);
    setCityQuery(city.result.label);
    setIsCityPickerOpen(false);
    setSelectedMusicScene(null);
    setSceneQuery("");
    setSceneOptions([]);
    setIsSceneListLoading(true);
    setAuthError(null);

    try {
      const scenes = await loadMusicScenesForCity(city);
      if (loadToken !== sceneLoadTokenRef.current) return;
      setSceneOptions(scenes);
      const preferredScene = preferredZoneId
        ? scenes.find((scene) => scene.zoneId === preferredZoneId)
        : null;
      const automaticScene = preferredScene ?? (scenes.length === 1 ? scenes[0] : null);
      if (automaticScene) {
        setSelectedMusicScene(automaticScene);
        setSceneQuery(automaticScene.label);
        setIsScenePickerOpen(false);
      } else {
        setIsScenePickerOpen(true);
      }
    } catch {
      if (loadToken === sceneLoadTokenRef.current) {
        setAuthError("Impossible de charger les quartiers de cette ville.");
      }
    } finally {
      if (loadToken === sceneLoadTokenRef.current) setIsSceneListLoading(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (loading) return;
    setLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    if (!navigator.geolocation) {
      setLoading(false);
      setAuthError("La géolocalisation n'est pas disponible. Choisis ta ville manuellement.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void resolveMusicSceneFromCoordinates(position.coords.latitude, position.coords.longitude)
          .then(async ({ city, scene }) => {
            await selectSceneCity(city, scene.zoneId);
            setSelectedMusicScene(scene);
            setSceneQuery(scene.label);
            setHasResolvedCurrentLocation(true);
            setAuthSuccess(`Ta scène ${scene.label} a été trouvée.`);
          })
          .catch((error: unknown) => {
            setAuthError(error instanceof Error ? error.message : "Impossible de trouver ta scène.");
          })
          .finally(() => setLoading(false));
      },
      () => {
        setLoading(false);
        setAuthError("Position non partagée. Choisis simplement une ville et un quartier.");
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
    );
  };

  const createOnboardingPayload = (
    profileId = "onboarding-current-user",
    useLocalPreviewPersona = false,
  ): MusicSceneOnboardingPayload | null => {
    if (!selectedSceneCity || !selectedMusicScene) return null;
    const avatarFile = selectedAvatarFile || "Utilisateur.png";
    return {
      version: 1,
      createdAt: Date.now(),
      ...(
        pendingSocialProvider
          ? { auth: { flow: "oauth" as const, provider: pendingSocialProvider } }
          : {}
      ),
      city: selectedSceneCity,
      scene: selectedMusicScene,
      profile: useLocalPreviewPersona
        ? {
            profileId: LOCAL_PREVIEW_FETAH_HOST.profileId,
            username: LOCAL_PREVIEW_FETAH_HOST.username,
            role: LOCAL_PREVIEW_FETAH_HOST.role,
            avatarFile: LOCAL_PREVIEW_FETAH_HOST.avatarFile,
            avatarIconId: LOCAL_PREVIEW_FETAH_HOST.avatarIconId,
            visible: isVisibleAroundMe,
          }
        : {
            profileId,
            username: signupUsername.trim() || "Mon profil",
            role: selectedRole || "Artiste",
            avatarFile,
            avatarIconId: getOnboardingAvatarIconId(avatarFile),
            visible: isVisibleAroundMe,
          },
    };
  };

  const handleGlobeClick = () => {
    if (localAuthPreviewAvailable) {
      const onboardingPayload = createOnboardingPayload(
        LOCAL_PREVIEW_FETAH_HOST.profileId,
        true,
      );
      if (onboardingPayload) saveMusicSceneOnboarding(onboardingPayload);
      else clearMusicSceneOnboardingPreview();
      enableLocalAuthPreview();
      navigate(MON_GLOBE_ROUTE, { replace: true });
      return;
    }

    const onboardingPayload = createOnboardingPayload();
    if (!onboardingPayload) {
      setAuthError("Choisis d'abord la scène musicale que tu veux rejoindre.");
      return;
    }

    if (pendingSocialProvider) {
      saveMusicSceneOnboarding(onboardingPayload);
      void launchSocialLogin(pendingSocialProvider);
      return;
    }

    const formElement = document.getElementById("step3-form") as HTMLFormElement;
    if (formElement) {
      formElement.requestSubmit();
    }
  };

  const signupCredentialError = validateSignupCredentials({
    username: signupUsername,
    email: signupEmail,
    password: signupPassword,
    confirmPassword: signupConfirmPassword,
  });
  const isSignupFormValid = signupCredentialError === null;

  const isLocationStepValid = Boolean(selectedSceneCity && selectedMusicScene);

  // Global auto-dismiss timer for premium toasts
  useEffect(() => {
    if (authError || authSuccess) {
      const timer = setTimeout(() => {
        setAuthError(null);
        setAuthSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [authError, authSuccess]);

  // Custom premium alert block (global floating toast)
  const renderAlert = () => {
    if (!authError && !authSuccess) return null;

    return (
      <div 
        className={`auth-toast-container ${authError ? "error" : "success"}`}
        role="alert"
      >
        <div className="auth-toast-content">
          {authError ? (
            <AlertCircle size={18} className="alert-icon" />
          ) : (
            <CheckCircle size={18} className="alert-icon" />
          )}
          <span>{authError || authSuccess}</span>
        </div>
      </div>
    );
  };



  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (mode === "signup" && !pendingSocialProvider) {
      const credentialError = validateSignupCredentials({
        username: signupUsername,
        email: signupEmail,
        password: signupPassword,
        confirmPassword: signupConfirmPassword,
      });
      if (credentialError) {
        setAuthError(credentialError);
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const emailToAuth = loginIdentifier.trim();
        if (!emailToAuth.includes("@")) {
          throw new Error("Entre l’adresse e-mail de ton compte.");
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToAuth,
          password: loginPassword,
        });

        if (error) throw error;
        let restoredArrival = null;
        try {
          restoredArrival = data.user
            ? await prepareAuthenticatedMusicSceneArrival(data.user)
            : null;
        } catch (arrivalError) {
          // A temporary catalogue failure must never turn a successful login
          // into an authentication error or keep a stale account destination.
          console.warn("[auth] Impossible de préparer l'arrivée sur la scène.", arrivalError);
        }
        if (data.user && restoredArrival) {
          restoredArrival = await persistMusicSceneProfile(data.user, restoredArrival);
        }
        if (!restoredArrival) clearMusicSceneOnboardingPreview();
        setAuthSuccess("Connexion réussie !");
        navigate(postLoginRoute, { replace: true });
      } else {
        // Sign-up: the account joins a musical scene, never a precise address.
        if (!selectedSceneCity || !selectedMusicScene) {
          throw new Error("Choisis la scène musicale que tu veux rejoindre.");
        }

        if (pendingSocialProvider) {
          const onboardingPayload = createOnboardingPayload();
          if (onboardingPayload) saveMusicSceneOnboarding(onboardingPayload);
          await launchSocialLogin(pendingSocialProvider);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: signupEmail.trim(),
          password: signupPassword,
          options: {
            data: {
              username: signupUsername.trim(),
              avatar_name: selectedAvatarFile,
              artist_type: selectedRole,
              city: selectedSceneCity.result.label,
              commune_code: selectedSceneCity.communeCode,
              zone_id: selectedMusicScene.zoneId,
              district_id: selectedMusicScene.zoneId,
              district_name: selectedMusicScene.label,
              scene_name: selectedMusicScene.label,
              scene_source: selectedMusicScene.source,
              longitude: selectedMusicScene.center[0],
              latitude: selectedMusicScene.center[1],
              country: "France",
              is_ghost_mode: !isVisibleAroundMe,
              show_on_public_profile: isVisibleAroundMe,
            }
          }
        });

        if (error) throw error;

        if (!data.user) {
          throw new Error("Supabase n'a pas confirmé la création du nouveau compte.");
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const activeSession = sessionData.session;
        if (!activeSession) {
          const pendingEmail = signupEmail.trim();
          clearMusicSceneOnboardingPreview();
          resetSignupDraft();
          setLoginIdentifier(pendingEmail);
          setMode("login");
          setAuthSuccess("Compte créé. Confirme ton adresse e-mail, puis connecte-toi.");
          return;
        }

        if (activeSession.user.id !== data.user.id) {
          await supabase.auth.signOut({ scope: "local" });
          clearMusicSceneOnboardingPreview();
          throw new Error("La session active ne correspond pas au nouveau compte. Recommence l'inscription.");
        }

        setAuthSuccess("Inscription réussie et connecté !");
        const onboardingPayload = createOnboardingPayload(data.user.id);
        if (onboardingPayload) await persistMusicSceneProfile(data.user, onboardingPayload);
        navigate(MON_GLOBE_ROUTE);
      }
    } catch (err: unknown) {
      setAuthError(getAuthErrorMessage(err, "Une erreur s’est produite."));
    } finally {
      setLoading(false);
    }
  }

  const handleSignupTransition = async () => {
    if (loading) return;
    setLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      clearMusicSceneOnboardingPreview();
      resetSignupDraft();
      setMode("signup");
    } catch (err: unknown) {
      setAuthError(getAuthErrorMessage(err, "Impossible de préparer une nouvelle inscription."));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setMode("login");
    setPendingSocialProvider(null);
    setAuthError(null);
    setAuthSuccess(null);
  };

  const handleStep2Submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPendingSocialProvider(null);
    setAuthError(null);
    setAuthSuccess(null);

    const credentialError = validateSignupCredentials({
      username: signupUsername,
      email: signupEmail,
      password: signupPassword,
      confirmPassword: signupConfirmPassword,
    });
    if (credentialError) {
      setAuthError(credentialError);
      return;
    }

    setLoading(true);
    try {
      // The backend performs a case-insensitive lookup without exposing profile
      // rows. The unique DB index remains authoritative if two signups race.
      const { data: isUsernameAvailable, error: checkUserError } = await supabase
        .rpc("is_profile_username_available", {
          p_username: signupUsername.trim(),
        });

      if (checkUserError) throw checkUserError;
      if (isUsernameAvailable !== true) {
        throw new Error("Ce nom d'utilisateur est déjà pris.");
      }

      handleStepChangeWithPulse(3);
    } catch (err: unknown) {
      setAuthError(getAuthErrorMessage(err, "Une erreur s’est produite lors de la vérification."));
    } finally {
      setLoading(false);
    }
  };

  const launchSocialLogin = async (provider: SocialProvider) => {
    setAuthError(null);
    setAuthSuccess(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: new URL(MON_GLOBE_ROUTE, window.location.origin).href,
        }
      });
      if (error) throw error;
    } catch (err: unknown) {
      setAuthError(getAuthErrorMessage(err, "Une erreur s’est produite lors de la connexion sociale."));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignup = (provider: SocialProvider) => {
    if (localAuthPreviewAvailable) {
      setPendingSocialProvider(null);
      setAuthError(null);
      setAuthSuccess("Mode aperçu local : aucun compte Google ou Apple ne sera créé.");
      handleStepChangeWithPulse(3);
      return;
    }

    setPendingSocialProvider(provider);
    setAuthError(null);
    setAuthSuccess(null);
    handleStepChangeWithPulse(3);
  };

  const handleBackToCredentials = () => {
    setPendingSocialProvider(null);
    handleStepChangeWithPulse(2);
  };

  return (
    <>
      {/* Invisible SVG for the responsive clip-path definition */}
      <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }}>
        <defs>
          <clipPath id="popup-clip" clipPathUnits="userSpaceOnUse">
            <path
              d="M4 56.7774C4 42.6659 16.1072 31.5421 30.2028 32.2135C51.7791 33.2412 82.423 33.7889 105.25 30.5C146.124 24.6109 165.204 0 206.5 0C247.796 0 266.876 24.6109 307.75 30.5C330.577 33.7889 361.221 33.2412 382.797 32.2135C396.893 31.5421 409 42.6659 409 56.7774C415.5 175.4 415.5 411.3 409 530C409 558 322 580 206.5 580C91 580 4 558 4 530C-2.5 411.3 -2.5 175.4 4 56.7774Z"
            />
          </clipPath>
        </defs>
      </svg>

      <main className="auth-page">
        <div className="auth-bg-fixed" />

        {/* Global Unified Header for both Login and Signup Flow */}
        <header className="unified-header">
          <div className="meewav-logo" aria-label="Meewav">
            <img src="/images/svg/Component 1.svg" className="meewav-logo-img" alt="Meewav Logo" />
          </div>

          {/* Auth navigation links on the right (visible during login mode) */}
          <nav className={`auth-nav ${mode === "login" ? "visible" : ""}`} aria-label="Navigation principale">
            <a href="#discover">Découvrir Meewav</a>
            <button type="button" className="language-button">
              FR
            </button>
          </nav>

          {/* Progress Stepper in the center (visible during signup mode) */}
          <div className={`steps-container ${mode === "signup" ? "visible" : ""}`}>
            <div className={`step-item ${signupStep === 1 ? "active" : "completed"}`}>
              <div className="step-circle">1</div>
              <span className="step-label">Avatar</span>
            </div>
            <div className={`step-line ${signupStep > 1 ? "completed" : ""}`} />
            <div className={`step-item ${signupStep === 2 ? "active" : signupStep > 2 ? "completed" : ""}`}>
              <div className="step-circle">2</div>
              <span className="step-label">Inscription</span>
            </div>
            <div className={`step-line ${signupStep > 2 ? "completed" : ""}`} />
            <div className={`step-item ${signupStep === 3 ? "active" : ""}`}>
              <div className="step-circle">3</div>
              <span className="step-label">Scène</span>
            </div>
          </div>
        </header>

        <div className="auth-viewport">
          <div 
            className="auth-slides-track"
            style={{ transform: `translate3d(-${slideIndex * 100}%, 0, 0)` }}
          >
            {/* Slide 0: Login */}
            <div className={`auth-slide-item ${currentStep === 0 ? "active" : ""}`}>
              <div className="auth-main-content">
                <section className="auth-hero" aria-label="Présentation Meewav">
                  <h1>
                    Rejoignez l’écosystème <span className="gradient-text">musical</span>
                  </h1>

                  <p>
                    Fondée par des <span className="highlight-text">artistes</span>, pour les artistes et leur public.
                  </p>

                  <div className="pillars-grid" aria-label="Piliers Meewav">
                    {pillarsData.map((pillar) => (
                      <PillarCard
                        key={pillar.title}
                        title={pillar.title}
                        description={pillar.description}
                        icon={pillar.icon}
                      />
                    ))}
                  </div>
                </section>

                <AuthPanelChrome className="auth-panel">
                  <div className="auth-panel-top">
                    <div className="mini-logo">
                      <svg width="34" height="22" viewBox="105 3 31 21" fill="none" xmlns="http://www.w3.org/2000/svg" className="auth-signature">
                        <path d="M106.75 22.0844C106.75 22.0844 109.74 18.3119 112.684 11.5627C115.996 3.97318 114.33 22.5971 115.875 19.6707C119.577 12.6589 119.823 4.51723 121.428 9.15285C123.46 15.0211 122.877 22.3987 124.262 18.7178C125.647 15.0369 125.59 6.78716 127.263 15.4913C128.937 24.1954 134.73 5.24531 134.73 5.24531" stroke="#9B63FF" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>

                    <h2>Bienvenue</h2>

                    <p className="auth-subtitle">
                      Entrez dans votre univers sonore.
                    </p>

                    <SubtitleDivider />
                  </div>

                  {renderAlert()}

                  <div className="auth-panel-body">
                    <form className="auth-form" onSubmit={handleSubmit}>
                      <label className="input-row">
                        <User size={19} className="input-icon" />
                        <input
                          type="email"
                          placeholder="Adresse e-mail"
                          autoComplete="email"
                          value={loginIdentifier}
                          onChange={(e) => setLoginIdentifier(e.target.value)}
                          disabled={loading}
                          required
                        />
                      </label>

                      <label className="input-row">
                        <Lock size={18} className="input-icon" />
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Mot de passe"
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          disabled={loading}
                          required
                        />

                        <button
                          type="button"
                          className="icon-button"
                          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          onClick={() => setShowPassword((value) => !value)}
                          disabled={loading}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </label>

                      <Link className="auth-forgot-password" to="/auth/reset-password">
                        Mot de passe oublié ?
                      </Link>

                      <button type="submit" className="primary-button" disabled={loading}>
                        {loading ? (
                          <span className="button-loader">
                            <Loader size={18} className="spinner-icon" />
                            Connexion...
                          </span>
                        ) : (
                          "Se Connecter"
                        )}
                      </button>
                    </form>
                  </div>

                  <div className="auth-panel-bottom">
                    <MidSeparator />

                    <div className="switch-mode">
                      <span className="switch-text">
                        Nouveau ici ?
                      </span>
                      <button
                        type="button"
                        className="switch-mode-button"
                        onClick={handleSignupTransition}
                        disabled={loading}
                      >
                        Créer un compte
                      </button>
                    </div>
                  </div>
                </AuthPanelChrome>
              </div>
            </div>

            {/* Slide 1: Avatar Selection */}
            <div className={`auth-slide-item ${currentStep === 1 ? "active" : ""}`}>
              <AvatarSelectionPage 
                onBack={handleBackToLogin} 
                onNext={(avatar, role) => {
                  setSelectedAvatar(avatar);
                  setSelectedRole(role);
                  setPendingSocialProvider(null);
                  setSignupStep(2);
                }}
              />
            </div>

            {/* Slide 2: Credentials & Localisation */}
            <div className={`auth-slide-item ${currentStep === 2 || currentStep === 3 ? "active" : ""}`}>
              <div className={`auth-main-content step-credentials-content ${signupStep === 3 ? "is-step3" : "is-step2"}`}>
                <section className="credentials-left-avatar">
                  <div className="chosen-avatar-meta">
                    <span className="chosen-avatar-pre">Tu as choisi</span>
                    <h3 className="chosen-avatar-role">{selectedRole || "Utilisatrice"}</h3>
                  </div>

                  <div className="chosen-avatar-display-box">
                    <img 
                      src={`/images/V4/${selectedAvatarFile || "Utilisatrice.png"}`}
                      alt={selectedRole || "Utilisatrice"} 
                      className="chosen-avatar-image-float"
                    />
                  </div>
                </section>

                <AuthPanelChrome className={`auth-panel ${isPulsing ? "popup-premium-pulse" : ""}`}>
                  <div className="auth-panel-top">
                    <div className="mini-logo">
                      <svg width="34" height="22" viewBox="105 3 31 21" fill="none" xmlns="http://www.w3.org/2000/svg" className="auth-signature">
                        <path d="M106.75 22.0844C106.75 22.0844 109.74 18.3119 112.684 11.5627C115.996 3.97318 114.33 22.5971 115.875 19.6707C119.577 12.6589 119.823 4.51723 121.428 9.15285C123.46 15.0211 122.877 22.3987 124.262 18.7178C125.647 15.0369 125.59 6.78716 127.263 15.4913C128.937 24.1954 134.73 5.24531 134.73 5.24531" stroke="#9B63FF" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>

                    <div key={signupStep} className="premium-content-fade">
                      {signupStep === 2 ? (
                        <div style={{ marginTop: "8px" }}>
                          <h2>Créer ton compte</h2>

                          <p className="auth-subtitle">
                            Renseigne tes informations pour rejoindre Meewav
                          </p>
                        </div>
                      ) : (
                        <div style={{ marginTop: "8px" }}>
                          <h2>Choisis ta scène</h2>
                          <p className="auth-subtitle">
                            Rejoins un quartier musical. Ton adresse reste privée.
                          </p>
                        </div>
                      )}
                    </div>

                    <div style={{ height: "41px" }} aria-hidden="true" />
                  </div>

                  <div className="auth-panel-body">
                    <div key={signupStep} className="premium-content-fade">
                      {signupStep === 2 ? (
                        <>
                          <div className="signup-interactive-block">
                            {/* Premium Inscription rapide social pills */}
                            <div className="quick-auth-section">
                              <span className="quick-auth-title">Inscription rapide</span>
                              <div className="quick-auth-buttons">
                                <button 
                                  type="button" 
                                  className="quick-auth-btn google-btn"
                                  onClick={() => handleSocialSignup("google")}
                                  disabled={loading}
                                >
                                  <svg className="btn-logo" viewBox="0 0 24 24" width="18" height="18">
                                    <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.137 4.114-3.415 0-6.19-2.775-6.19-6.19 0-3.415 2.775-6.19 6.19-6.19 1.566 0 2.98.587 4.09 1.547l3.053-3.053C19.102 2.215 15.875 1.1 12.24 1.1c-6.02 0-10.9 4.88-10.9 10.9s4.88 10.9 10.9 10.9c5.694 0 10.23-4.114 10.23-10.285 0-.583-.05-1.16-.145-1.73H12.24z"/>
                                    <path fill="#4285F4" d="M22.325 12.115c0-.583-.05-1.16-.145-1.73H12.24V14.4h6.887c-.288 1.074-.908 1.986-1.748 2.686v.025l3.242 2.512c1.897-1.747 2.994-4.318 2.994-7.508z"/>
                                    <path fill="#FBBC05" d="M7.127 14.544a6.136 6.136 0 0 1-.322-1.954c0-.68.113-1.334.322-1.954V7.583H3.84a10.853 10.853 0 0 0-.9 4.607c0 1.637.3 3.197.9 4.607l3.287-2.253z"/>
                                    <path fill="#34A853" d="M12.24 22.9c3.273 0 6.02-1.083 8.03-2.95l-3.242-2.512c-.902.604-2.057.962-3.264.962-2.618 0-4.85-1.704-5.137-4.114H5.34l-3.287 2.535C4.1 20.316 7.9 22.9 12.24 22.9z"/>
                                  </svg>
                                  Google
                                </button>
                                <button 
                                  type="button" 
                                  className="quick-auth-btn apple-btn"
                                  onClick={() => handleSocialSignup("apple")}
                                  disabled={loading}
                                >
                                  <svg className="btn-logo" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.07 2.47.3 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.69-1.12 1.83-.98 2.94 1.07.08 2.15-.52 2.81-1.33z"/>
                                  </svg>
                                  Apple
                                </button>
                              </div>

                              <div className="quick-auth-divider">
                                <span className="divider-line" />
                                <span className="divider-text">ou</span>
                                <span className="divider-line" />
                              </div>
                            </div>
                          </div>

                          {renderAlert()}

                          <form id="step2-form" className="auth-form" onSubmit={handleStep2Submit}>
                            <label className="input-row">
                              <User size={19} className="input-icon" />
                              <input
                                type="text"
                                placeholder="Nom d'utilisateur"
                                autoComplete="username"
                                value={signupUsername}
                                onChange={(e) => setSignupUsername(e.target.value)}
                                maxLength={SIGNUP_USERNAME_MAX_LENGTH}
                                disabled={loading}
                                required
                              />
                            </label>

                            <label className="input-row">
                              <AtSign size={19} className="input-icon" />
                              <input
                                type="email"
                                placeholder="Adresse e-mail"
                                autoComplete="email"
                                value={signupEmail}
                                onChange={(e) => setSignupEmail(e.target.value)}
                                disabled={loading}
                                required
                              />
                            </label>

                            <label className="input-row">
                              <Lock size={18} className="input-icon" />
                              <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Mot de passe"
                                autoComplete="new-password"
                                value={signupPassword}
                                onChange={(e) => setSignupPassword(e.target.value)}
                                disabled={loading}
                                required
                              />
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                onClick={() => setShowPassword((value) => !value)}
                                disabled={loading}
                              >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </label>

                            <label className="input-row">
                              <Lock size={18} className="input-icon" />
                              <input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirmez le mot de passe"
                                autoComplete="new-password"
                                value={signupConfirmPassword}
                                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                                disabled={loading}
                                required
                              />
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                onClick={() => setShowConfirmPassword((value) => !value)}
                                disabled={loading}
                              >
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </label>
                          </form>

                          <div className="switch-mode-credentials">
                            <button
                              type="button"
                              className="switch-mode-credentials-link"
                              onClick={handleBackToLogin}
                              disabled={loading}
                            >
                              Déjà un compte ? <span className="highlight-purple-text">Se connecter</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="signup-interactive-block">
                            <form id="step3-form" className="auth-form" onSubmit={handleSubmit}>
                              <button 
                                type="button" 
                                className="btn-use-current-location"
                                onClick={handleUseCurrentLocation}
                                disabled={loading}
                              >
                                <MapPin size={16} className="use-location-icon" />
                                {loading
                                  ? "Recherche de ta scène..."
                                  : hasResolvedCurrentLocation && selectedMusicScene
                                    ? `Scène détectée · ${selectedMusicScene.label}`
                                    : "Trouver ma scène autour de moi"}
                              </button>

                              <div className="location-or-divider">
                                <span className="line"></span>
                                <span className="text">ou choisir ton quartier</span>
                                <span className="line"></span>
                              </div>

                              <div
                                className={`scene-picker-field ${isCityPickerOpen ? "is-open" : ""}`}
                                onMouseDown={handlePickerChromeMouseDown}
                                onClick={handleCityPickerFieldClick}
                              >
                                <Search size={18} className="scene-picker-icon" />
                                <input
                                  type="text"
                                  placeholder={isSceneIndexLoading ? "Chargement des villes..." : "Ville ou commune"}
                                  value={cityQuery}
                                  role="combobox"
                                  aria-autocomplete="list"
                                  aria-expanded={isCityPickerOpen}
                                  aria-controls="music-scene-city-options"
                                  aria-activedescendant={
                                    isCityPickerOpen && citySuggestions[activeCitySuggestionIndex]
                                      ? `music-scene-city-option-${citySuggestions[activeCitySuggestionIndex].communeCode}`
                                      : undefined
                                  }
                                  onFocus={() => {
                                    setActiveCitySuggestionIndex(0);
                                    setIsCityPickerOpen(true);
                                  }}
                                  onChange={(event) => {
                                    sceneLoadTokenRef.current += 1;
                                    setCityQuery(event.target.value);
                                    setSelectedSceneCity(null);
                                    setSelectedMusicScene(null);
                                    setSceneOptions([]);
                                    setSceneQuery("");
                                    setIsSceneListLoading(false);
                                    setHasResolvedCurrentLocation(false);
                                    setActiveCitySuggestionIndex(0);
                                    setIsCityPickerOpen(true);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      setIsCityPickerOpen(false);
                                      return;
                                    }
                                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                      event.preventDefault();
                                      setIsCityPickerOpen(true);
                                      if (citySuggestions.length === 0) return;
                                      setActiveCitySuggestionIndex((currentIndex) => {
                                        const direction = event.key === "ArrowDown" ? 1 : -1;
                                        return (currentIndex + direction + citySuggestions.length) % citySuggestions.length;
                                      });
                                      return;
                                    }
                                    if (event.key === "Enter" && isCityPickerOpen) {
                                      if (isCitySearchPending) return;
                                      const city = citySuggestions[activeCitySuggestionIndex] ?? citySuggestions[0];
                                      if (!city) return;
                                      event.preventDefault();
                                      void selectSceneCity(city);
                                    }
                                  }}
                                  disabled={loading || isSceneIndexLoading}
                                  autoComplete="off"
                                />
                                <ChevronRight size={16} className="scene-picker-chevron" />
                                {isCityPickerOpen && (
                                  <>
                                    <button
                                      type="button"
                                      className="scene-picker-overlay"
                                      aria-label="Fermer la liste des villes"
                                      onClick={() => setIsCityPickerOpen(false)}
                                    />
                                    <div
                                      id="music-scene-city-options"
                                      className="scene-picker-menu city-picker-menu"
                                      role="listbox"
                                      aria-label="Catalogue des villes et communes"
                                    >
                                      {citySuggestions.map((city) => (
                                        <button
                                          type="button"
                                          id={`music-scene-city-option-${city.communeCode}`}
                                          className={`scene-picker-option ${citySuggestions[activeCitySuggestionIndex]?.communeCode === city.communeCode ? "is-active" : ""}`}
                                          key={city.communeCode}
                                          aria-selected={selectedSceneCity?.communeCode === city.communeCode}
                                          onMouseEnter={() => setActiveCitySuggestionIndex(
                                            citySuggestions.findIndex((candidate) => candidate.communeCode === city.communeCode),
                                          )}
                                          onClick={() => void selectSceneCity(city)}
                                        >
                                          <span>
                                            <strong>{city.result.label}</strong>
                                            <small>{city.result.subtitle}</small>
                                          </span>
                                          <ChevronRight size={15} />
                                        </button>
                                      ))}
                                      {citySuggestions.length === 0 && !isCitySearchPending && (
                                        <div className="city-picker-empty">
                                          Aucune commune ne correspond à cette recherche.
                                        </div>
                                      )}
                                      {Boolean(
                                        cityQuery.trim()
                                        && citySuggestions.length < cityCatalogSearch.total
                                        && citySuggestions.length < 60
                                      ) && (
                                        <button
                                          type="button"
                                          className="city-picker-load-more"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setCitySuggestionLimit((current) => Math.min(60, current + 10));
                                          }}
                                        >
                                          Afficher plus de communes
                                        </button>
                                      )}
                                      <div className="city-picker-catalog-status" aria-live="polite">
                                        <strong>
                                          {isCitySearchPending
                                            ? "Recherche dans tout le catalogue…"
                                            : cityQuery.trim()
                                              ? `${cityCatalogSearch.total.toLocaleString("fr-FR")} résultat${cityCatalogSearch.total > 1 ? "s" : ""}`
                                              : `${sceneCities.length.toLocaleString("fr-FR")} communes disponibles`}
                                        </strong>
                                        <span>Nom, code postal ou code INSEE · catalogue complet</span>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>

                              <div
                                className={`scene-picker-field ${!selectedSceneCity ? "is-disabled" : ""} ${isScenePickerOpen ? "is-open" : ""}`}
                                onMouseDown={handlePickerChromeMouseDown}
                                onClick={handleScenePickerFieldClick}
                              >
                                <Music2 size={18} className="scene-picker-icon" />
                                <input
                                  type="text"
                                  placeholder={isSceneListLoading ? "Chargement des quartiers..." : "Quartier / scène musicale"}
                                  value={sceneQuery}
                                  onFocus={() => selectedSceneCity && setIsScenePickerOpen(true)}
                                  onChange={(event) => {
                                    setSceneQuery(event.target.value);
                                    setSelectedMusicScene(null);
                                    setHasResolvedCurrentLocation(false);
                                    setIsScenePickerOpen(true);
                                  }}
                                  disabled={loading || !selectedSceneCity || isSceneListLoading}
                                  autoComplete="off"
                                />
                                <ChevronRight size={16} className="scene-picker-chevron" />
                                {isScenePickerOpen && selectedSceneCity && filteredSceneOptions.length > 0 && (
                                  <>
                                    <button
                                      type="button"
                                      className="scene-picker-overlay"
                                      aria-label="Fermer la liste des quartiers"
                                      onClick={() => setIsScenePickerOpen(false)}
                                    />
                                    <div className="scene-picker-menu scene-list-menu" role="listbox">
                                      {filteredSceneOptions.map((scene) => (
                                        <button
                                          type="button"
                                          key={scene.zoneId}
                                          className={`scene-picker-option ${selectedMusicScene?.zoneId === scene.zoneId ? "is-selected" : ""}`}
                                          onClick={() => {
                                            setSelectedMusicScene(scene);
                                            setSceneQuery(scene.label);
                                            setIsScenePickerOpen(false);
                                            setHasResolvedCurrentLocation(false);
                                          }}
                                        >
                                          <strong>{scene.label}</strong>
                                          <ChevronRight size={15} />
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className={`scene-assignment-card ${selectedMusicScene ? "is-ready" : ""}`}>
                                <div className="scene-assignment-icon">
                                  {selectedMusicScene ? <Music2 size={18} /> : <ShieldCheck size={18} />}
                                </div>
                                <div className="scene-assignment-copy">
                                  <span>{selectedMusicScene ? "Ta scène musicale" : "Localisation respectueuse"}</span>
                                  <strong>{selectedMusicScene?.label ?? "Aucune adresse précise demandée"}</strong>
                                  <small>
                                    {selectedMusicScene && selectedSceneCity
                                      ? `${selectedSceneCity.result.label} · découvertes, rooms et battles locales`
                                      : "Ton profil rejoint un quartier musical, jamais une adresse."}
                                  </small>
                                </div>
                              </div>

                              <div className="confidentiality-section">
                                <span className="confidentiality-label">Visibilité sur la scène</span>
                                <div className="confidentiality-row">
                                  <div className="confidentiality-left">
                                    <User size={18} className="confidentiality-icon" />
                                    <div className="visibility-text-block">
                                      <span className="confidentiality-text">Afficher mon avatar</span>
                                      <span className="confidentiality-subtext">Ton adresse n'est jamais affichée.</span>
                                    </div>
                                  </div>
                                  <label className="toggle-switch">
                                    <input
                                      type="checkbox"
                                      checked={isVisibleAroundMe}
                                      onChange={(e) => setIsVisibleAroundMe(e.target.checked)}
                                      disabled={loading}
                                    />
                                    <span className="toggle-slider"></span>
                                  </label>
                                </div>
                              </div>
                            </form>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="auth-panel-bottom">
                    <div className="switch-mode" />
                  </div>
                </AuthPanelChrome>

                <div className="credentials-right-space" />

                <div className="auth-footer-buttons">
                  {signupStep === 2 ? (
                    <>
                      <button 
                        type="button" 
                        className="back-step-button" 
                        onClick={() => {
                          setPendingSocialProvider(null);
                          setSignupStep(1);
                        }}
                        disabled={loading}
                      >
                        <ChevronLeft size={16} strokeWidth={2.5} className="back-arrow-icon" />
                        RETOUR
                      </button>

                      <p className="legal-text-centered">
                        En continuant, tu acceptes les <a href="#cgu" className="legal-link">Conditions générales d'utilisation</a> de Meewav et la <a href="#privacy" className="legal-link">Politique de confidentialité</a>.
                      </p>

                      <button 
                        type="submit" 
                        form="step2-form"
                        className="next-step-button"
                        disabled={loading || !isSignupFormValid}
                      >
                        {loading ? (
                          <span className="button-loader">
                            <Loader size={16} className="spinner-icon" />
                            Vérification...
                          </span>
                        ) : (
                          <>
                            SUIVANT
                            <ArrowRight size={16} strokeWidth={2} className="next-arrow-icon" />
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        type="button" 
                        className="back-step-button" 
                        onClick={handleBackToCredentials}
                        disabled={loading}
                      >
                        <ChevronLeft size={16} strokeWidth={2.5} className="back-arrow-icon" />
                        RETOUR
                      </button>
                    </>
                  )}
                </div>

                <HolographicOrbCTA
                  active={localAuthPreviewAvailable || isLocationStepValid}
                  loading={loading}
                  onClick={handleGlobeClick}
                  label="Entrer sur Mon Globe"
                  visible={signupStep === 3}
                  alert={renderAlert()}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
