import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "./AuthContext";
import {
  EMPTY_BRANDING,
  getBrandingSettings,
  saveBrandingSettings,
  type BrandingSettings,
} from "../services/brandingService";

interface BrandingContextValue extends BrandingSettings {
  loading: boolean;
  updateBranding: (settings: BrandingSettings) => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [branding, setBranding] = useState<BrandingSettings>(EMPTY_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBranding(EMPTY_BRANDING);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getBrandingSettings(user.id)
      .then((settings) => {
        if (!cancelled) setBranding(settings);
      })
      .catch(() => {
        if (!cancelled) setBranding(EMPTY_BRANDING);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function updateBranding(settings: BrandingSettings) {
    if (!user) return;
    await saveBrandingSettings(user.id, settings);
    setBranding(settings);
  }

  return (
    <BrandingContext.Provider value={{ ...branding, loading, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return ctx;
}
