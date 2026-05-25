import pkg from "../../package.json";

type PackageWithSite = typeof pkg & {
  site?: {
    repository?: { url?: string };
    issues?: { url?: string };
    sponsor?: { url?: string; color?: string };
    coffee?: { url?: string };
  };
};

const p = pkg as PackageWithSite;

export const siteConfig = {
  repositoryUrl: p.site?.repository?.url ?? "#",
  issuesUrl: p.site?.issues?.url ?? "#",
  sponsorUrl: p.site?.sponsor?.url ?? "#",
  sponsorColor: p.site?.sponsor?.color ?? "#c45b95",
  coffeeUrl: p.site?.coffee?.url ?? "#",
} as const;
