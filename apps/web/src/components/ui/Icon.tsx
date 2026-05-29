import { forwardRef, type HTMLAttributes, type ComponentType } from "react";
import * as BsIcons from "react-icons/bs";
import * as GoIcons from "react-icons/go";
import * as VscIcons from "react-icons/vsc";
import * as BoxIcons from "react-icons/bi";
import * as Octicons from "@primer/octicons-react";
import { cn } from "@/lib/cn";

export interface IconProps extends HTMLAttributes<HTMLElement> {
  /** Icon name. Supports: "bs:name" or bare "name" for Bootstrap, "go:name" or "octicons:name" for GitHub Octicons, or "/path" or "https://..." for URLs. */
  name: string;
  /** Size in pixels. Used for icons (default 16) and image URLs (sets width/height). */
  size?: number;
}

const isUrl = (str: string): boolean => {
  return str.startsWith("/") || /^https?:\/\//.test(str);
};

const getOcticonComponent = (
  name: string
): ComponentType<{ size: number; className?: string }> | null => {
  const key =
    name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Icon";

  return (
    (Octicons[key as keyof typeof Octicons] as ComponentType<{
      size: number;
      className?: string;
    }>) || null
  );
};

const toReactIconComponentName = (
  name: string,
  componentPrefix: string
): string => {
  return (
    componentPrefix +
    name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  );
};

const iconLibraries = {
  bi: BoxIcons,
  bs: BsIcons,
  go: GoIcons,
  vsc: VscIcons,
};

type IconType = keyof typeof iconLibraries | "bootstrap" | "boxicons" | "octicons" | "vscode" | "url";

export const Icon = forwardRef<HTMLElement, IconProps>(
  ({ name, size = 16, className, ...props }, ref) => {
    let iconType: IconType = "bootstrap";
    let iconName = name;
    let libraryPrefix = "bs";

    const protocol = name.split(":")[0] || "";
    const iconNamePart = name.split(":")[1];

    switch (protocol) {
      case "bi":
        iconType = "boxicons";
        iconName = iconNamePart || name;
        libraryPrefix = "bi";
        break;
      case "bs":
      case "bootstrap":
        iconType = "bootstrap";
        iconName = iconNamePart || name;
        libraryPrefix = "bs";
        break;
      case "go":
      case "octicons":
      case "octicon":
        iconType = "octicons";
        iconName = iconNamePart || name;
        break;
      case "vscode":
      case "vsc":
        iconType = "vscode";
        iconName = iconNamePart || name;
        break;
      default:
        if (isUrl(name)) {
          iconType = "url";
        }
    }

    let componentName: string;
    let IconComponent: ComponentType<{ size: number; className?: string }> | null = null;

    switch (iconType) {
      case "octicons":
        // Try @primer/octicons-react first
        const OcticonComponent = getOcticonComponent(iconName);
        if (OcticonComponent) {
          return (
            <OcticonComponent
              size={size}
              className={cn(className)}
              aria-hidden="true"
              {...(props as any)}
            />
          );
        }

        // Fallback to react-icons go icons
        componentName = toReactIconComponentName(iconName, "Go");
        IconComponent = GoIcons[componentName as keyof typeof GoIcons];

        if (IconComponent) {
          return (
            <IconComponent
              size={size}
              className={cn(className)}
              aria-hidden="true"
              {...(props as any)}
              ref={ref as any}
            />
          );
        }

        console.warn(`Octicon not found: ${iconName}`);
        return null;
      case "bootstrap":
        componentName = toReactIconComponentName(iconName, "Bs");
        IconComponent = BsIcons[componentName as keyof typeof BsIcons];

        if (IconComponent) {
          return (
            <IconComponent
              size={size}
              className={cn(className)}
              aria-hidden="true"
              {...(props as any)}
              ref={ref as any}
            />
          );
        }

        console.warn(`Bootstrap icon not found: ${componentName}`);
        return null;
      case "vscode":
        componentName = toReactIconComponentName(iconName, "Vsc");
        IconComponent = VscIcons[componentName as keyof typeof VscIcons];

        if (IconComponent) {
          return (
            <IconComponent
              size={size}
              className={cn(className)}
              aria-hidden="true"
              {...(props as any)}
              ref={ref as any}
            />
          );
        }

        console.warn(`VSCode icon not found: ${componentName}`);
        return null;
      case "boxicons":
        componentName = toReactIconComponentName(iconName, "Bi");
        IconComponent = BoxIcons[componentName as keyof typeof BoxIcons];

        if (IconComponent) {
          return (
            <IconComponent
              size={size}
              className={cn(className)}
              aria-hidden="true"
              {...(props as any)}
              ref={ref as any}
            />
          );
        }

        console.warn(`Boxicons icon not found: ${componentName}`);
        return null;
      case "url":
      default:
        return (
          <img
            ref={ref as any}
            src={name}
            alt=""
            width={size}
            height={size}
            aria-hidden="true"
            className={className}
            {...props}
          />
        );
    }

    return null;
  }
);

Icon.displayName = "Icon";
