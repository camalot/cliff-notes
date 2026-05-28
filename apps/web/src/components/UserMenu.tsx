import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import type { AuthUser } from "@/lib/api";

interface Props {
  user: AuthUser;
  onLogout: () => void;
}

export function UserMenu({ user, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Signed in as ${user.login}`}
        aria-label={`Signed in as ${user.login}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border transition-opacity hover:opacity-80"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.login}
            width={28}
            height={28}
            className="w-full h-full object-cover rounded-full"
          />
        ) : (
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-fg">
            <Icon name="vsc:account" size={16} aria-hidden="true" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-48 rounded-md border border-border bg-card shadow-lg z-50 py-1"
        >
          {/* Username — display only */}
          <div
            role="menuitem"
            aria-disabled="true"
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-fg select-none"
          >
            <Icon name="vsc:account" size={14} aria-hidden="true" />
            <span className="truncate">@{user.login}</span>
          </div>

          {/* Settings — disabled */}
          <button
            type="button"
            role="menuitem"
            disabled
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-fg disabled:opacity-40 disabled:pointer-events-none"
          >
            <Icon name="go:gear" size={14} aria-hidden="true" />
            Settings
          </button>

          <hr className="my-1 border-border" />

          {/* Logout */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-fg hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:bg-muted/60"
          >
            <Icon name="go:sign-out" size={14} aria-hidden="true" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
