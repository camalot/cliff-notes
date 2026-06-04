import pkg from "../../package.json";

type PackageWithSite = typeof pkg & {
  site?: {
    repository?: { url?: string; color?: string; icon?: string; };
    issues?: { url?: string; color?: string; icon?: string };
    sponsor?: { url?: string; color?: string; icon?: string };
    coffee?: { url?: string; color?: string; icon?: string };
    discord?: { url?: string; color?: string; icon?: string };
    vscmarket?: { url?: string; color?: string; icon?: string };
    openvsx?: { url?: string; color?: string; icon?: string };
  };
};

const p = pkg as PackageWithSite;

export const siteConfig = {
  repository: {
    url: p.site?.repository?.url ?? "#",
    icon: p.site?.repository?.icon ?? "go:mark-github",
  },
  issues: {
    url: p.site?.issues?.url ?? "#",
    icon: p.site?.issues?.icon ?? "go:bug",
  },
  sponsor: {
    url: p.site?.sponsor?.url ?? "#",
    color: p.site?.sponsor?.color ?? "#c45b95",
    icon: p.site?.sponsor?.icon ?? "go:heart-fill",
  },
  coffee: {
    url: p.site?.coffee?.url ?? "#",
    icon: p.site?.coffee?.icon ?? "bi:coffee-togo",
  },
  discord: {
    url: p.site?.discord?.url ?? "#",
    icon: p.site?.discord?.icon ?? "bi:logo-discord-alt",
  },
  vscmarket: {
    url: p.site?.vscmarket?.url ?? "#",
    icon: p.site?.vscmarket?.icon ?? "vsc:extensions",
  },
  openvsx: {
    url: p.site?.openvsx?.url ?? "#",
    icon: p.site?.openvsx?.icon ?? "vsc:extensions",
  }
} as const;
