import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "../context/GameContext";

const LEGAL_ROUTES: Record<string, string> = {
  tos: "/legal/terms",
  privacy: "/legal/privacy",
  commercial: "/legal/tokusho",
};

export default function LegalPanel() {
  const router = useRouter();
  const { showLegalPage, setShowLegalPage } = useGame();

  useEffect(() => {
    if (!showLegalPage) return;
    const route = LEGAL_ROUTES[showLegalPage];
    setShowLegalPage(null);
    if (route) router.push(route);
  }, [router, setShowLegalPage, showLegalPage]);

  // Legal copy has one canonical source: the public /legal/* routes. Keeping
  // duplicate copy in an in-game panel risks exposing stale placeholders.
  return null;
}
