import GlobeLoading from "../../../vendor/meewav-vinyl/src/GlobeLoading";
import "../../styles/route-loading.css";

export default function AppRouteLoading() {
  return (
    <main className="app-route-loading" aria-busy="true">
      <GlobeLoading label="Chargement de MeeWav…" />
    </main>
  );
}
