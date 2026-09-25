import type { ReactNode } from "react";
import AppRouteLoading from "../../components/shared/AppRouteLoading";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isLocalAuthPreviewEnabled } from "./localAuthPreview";

type RequireAuthProps = {
  children: ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const { needsOnboarding, onboardingStatus, status } = useAuth();

  if (isLocalAuthPreviewEnabled()) return children;

  if (status === "loading" || (status === "authenticated" && onboardingStatus === "checking")) {
    return <AppRouteLoading />;
  }

  if (status === "anonymous") {
    if (isLocalAuthPreviewEnabled()) return children;
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/auth" replace state={{ returnTo }} />;
  }

  if (needsOnboarding) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/auth?resume_onboarding=1" replace state={{ returnTo }} />;
  }

  return children;
}
