import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import { useAppStore } from "@/store";

interface AuthProvider {
  id: string;
  label: string;
  icon: string;
  authPath: string;
}

const PROVIDERS: AuthProvider[] = [
  {
    id: "github",
    label: "Sign in with GitHub",
    icon: "go:mark-github",
    authPath: "/api/auth/github",
  },
];

export function LoginModal() {
  const { fetchUser, setLoginModalOpen } = useAppStore();
  const overlayRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<Window | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const onClose = () => {
    popupRef.current?.close();
    setLoginModalOpen(false);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for postMessage from the OAuth popup
  useEffect(() => {
    let aborted = false;
    const expectedOrigin = window.location.origin;

    const handler = (event: MessageEvent) => {
      // Validate origin before trusting the message
      if (event.origin !== expectedOrigin) return;
      if (!event.data || typeof event.data !== "object") return;

      if (event.data.type === "auth:success") {
        if (aborted) return;
        void fetchUser().then(() => {
          if (!aborted) setLoginModalOpen(false);
        });
      }
    };

    window.addEventListener("message", handler);
    return () => {
      aborted = true;
      window.removeEventListener("message", handler);
      popupRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderClick = (provider: AuthProvider) => {
    setPopupBlocked(false);
    const popup = window.open(
      provider.authPath,
      "github-auth",
      "width=600,height=700,left=200,top=100",
    );
    if (!popup) {
      setPopupBlocked(true);
      return;
    }
    popupRef.current = popup;
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-fg">Sign in to cliff-notes</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-fg hover:text-fg transition-colors ml-4"
            aria-label="Close"
          >
            <Icon name="bi:x-lg" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-muted-fg mb-5">
          Sign in with your GitHub account to access upcoming features.
        </p>

        {popupBlocked && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger bg-danger/10 px-3 py-2 mb-4 text-xs text-danger"
          >
            <Icon name="bi:exclamation-octagon-fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              Popups are blocked by your browser. Please allow popups for this site and try again.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => handleProviderClick(provider)}
              className="flex items-center justify-center gap-2 w-full rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm font-medium text-fg hover:bg-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
            >
              <Icon name={provider.icon} size={18} aria-hidden="true" />
              {provider.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
