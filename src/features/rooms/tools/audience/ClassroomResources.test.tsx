import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ClassroomResources from "./ClassroomResources";
import { createClassroomDemoResources } from "../classroom/classroomResources.demo";
import { resolveClassroomResourceUrl } from "../classroom/classroomResourceMedia.service";

vi.mock("../classroom/classroomResourceMedia.service", () => ({ resolveClassroomResourceUrl: vi.fn(), downloadClassroomResource: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("opens the actual video, audio and link resources on demand and keeps a single media preview", async () => {
  const resources = createClassroomDemoResources();
  vi.mocked(resolveClassroomResourceUrl).mockImplementation(async resource => resource.mediaUrl!);
  const { container } = render(<ClassroomResources resources={resources} roomId="demo-class" source="demo" />);
  expect(container.querySelector("audio,video")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Regarder" }));
  await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", resources.find(r => r.kind === "video")!.mediaUrl));
  fireEvent.click(screen.getByRole("button", { name: "Écouter" }));
  await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", resources.find(r => r.kind === "audio")!.mediaUrl));
  expect(container.querySelector("video")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
  expect(await screen.findByRole("link", { name: "Consulter la ressource" })).toHaveAttribute("href", resources.find(r => r.kind === "link")!.mediaUrl);
  expect(container.querySelector("audio")).toBeNull();
});

it("keeps a real empty class empty and provides a retry after an access failure", async () => {
  const ui = render(<ClassroomResources resources={[]} roomId="live-room" source="live" />);
  expect(screen.getByText("Le professeur n’a pas encore partagé de ressource.")).toBeVisible();
  expect(screen.queryByText("Exemples de démonstration")).not.toBeInTheDocument();
  vi.mocked(resolveClassroomResourceUrl).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("https://test.invalid/signed-audio");
  ui.rerender(<ClassroomResources resources={[createClassroomDemoResources().find(r => r.kind === "audio")!]} roomId="live-room" source="live" />);
  fireEvent.click(screen.getByRole("button", { name: "Écouter" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Écouter" }));
  await waitFor(() => expect(ui.container.querySelector("audio")).toHaveAttribute("src", "https://test.invalid/signed-audio"));
  expect(resolveClassroomResourceUrl).toHaveBeenLastCalledWith(expect.anything(), "live-room", "live");
});
