import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GistExplorer } from "./GistExplorer";
import type { GistProject } from "../lib/gist-format";

const PROJECTS: GistProject[] = [
  {
    id: "proj-1",
    name: "Alpha Project",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    playgrounds: [
      {
        id: "pg-1",
        projectId: "proj-1",
        name: "My Playground",
        description: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        filename: "proj-1--pg-1.cliff-notes",
        rawUrl: null,
        truncated: false,
      },
    ],
  },
];

describe("GistExplorer — open mode", () => {
  it("renders project names", () => {
    render(
      <GistExplorer
        mode="open"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
  });

  it("shows playground after expanding project", () => {
    render(
      <GistExplorer
        mode="open"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Alpha Project"));
    expect(screen.getByText("My Playground")).toBeInTheDocument();
  });

  it("calls onSelectPlayground when file clicked", () => {
    const onSelect = vi.fn();
    render(
      <GistExplorer
        mode="open"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        onSelectPlayground={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Alpha Project"));
    fireEvent.click(screen.getByText("My Playground"));
    expect(onSelect).toHaveBeenCalledWith(PROJECTS[0]!.playgrounds[0]);
  });
});

describe("GistExplorer — save mode", () => {
  it("shows filename input when a project is selected", () => {
    render(
      <GistExplorer
        mode="save"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        selectedProjectId="proj-1"
        fileName="my-playground.cliff-notes"
        onFileNameChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("my-playground.cliff-notes")).toBeInTheDocument();
  });

  it("shows new-project button in save mode", () => {
    render(
      <GistExplorer
        mode="save"
        projects={[]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByTitle("New project")).toBeInTheDocument();
  });
});

describe("GistExplorer — loading / error states", () => {
  it("shows loading indicator", () => {
    render(
      <GistExplorer
        mode="open"
        projects={[]}
        loading={true}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading gist/i)).toBeInTheDocument();
  });

  it("shows error with retry button", () => {
    const onRefresh = vi.fn();
    render(
      <GistExplorer
        mode="open"
        projects={[]}
        loading={false}
        error="Network error"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByText("Network error")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRefresh).toHaveBeenCalled();
  });
});
