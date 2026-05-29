import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SplitButton } from "./SplitButton";

const ACTIONS = [
  { key: "local", label: "Save Locally", icon: "vsc:save" },
  { key: "gist", label: "Save to GitHub Gist", icon: "vsc:github-inverted" },
];

describe("SplitButton", () => {
  it("displays active action label", () => {
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={vi.fn()}
        onChangeActiveKey={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Save Locally")).toBeInTheDocument();
  });

  it("calls onAction with active key on main button click", () => {
    const onAction = vi.fn();
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={onAction}
        onChangeActiveKey={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle("Save Locally"));
    expect(onAction).toHaveBeenCalledWith("local");
  });

  it("opens dropdown on chevron click", () => {
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={vi.fn()}
        onChangeActiveKey={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[1]!); // chevron
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Save to GitHub Gist")).toBeInTheDocument();
  });

  it("calls onChangeActiveKey and onAction when dropdown item selected", () => {
    const onAction = vi.fn();
    const onChangeActiveKey = vi.fn();
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={onAction}
        onChangeActiveKey={onChangeActiveKey}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[1]!); // chevron
    fireEvent.click(screen.getByText("Save to GitHub Gist"));
    expect(onChangeActiveKey).toHaveBeenCalledWith("gist");
    expect(onAction).toHaveBeenCalledWith("gist");
  });
});
