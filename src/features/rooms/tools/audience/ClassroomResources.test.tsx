import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ClassroomResources from "./ClassroomResources";
import { createClassroomDemoResources } from "../classroom/classroomResources.demo";
import { downloadClassroomResource } from "../classroom/classroomResourceMedia.service";
vi.mock("../classroom/classroomResourceMedia.service", () => ({ downloadClassroomResource: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("downloads each support directly without mounting a player or a preview", async () => {
  const support = createClassroomDemoResources()[0];
  const resources = [support, ...(["image", "audio", "video"] as const).map(kind => ({ ...support, id: kind, kind, name: kind, mediaUrl: "/media/example" }))];
  const { container } = render(<ClassroomResources resources={resources} roomId="demo-class" source="demo" />);
  expect(screen.getAllByRole("button")).toHaveLength(resources.length);
  for (const resource of resources) {
    fireEvent.click(screen.getByRole("button", { name: `Télécharger ${resource.name}` }));
    await waitFor(() => expect(downloadClassroomResource).toHaveBeenCalledWith(resource, "demo-class", "demo"));
  }
  expect(container.querySelector("audio,video,iframe,.classe-resource__preview")).toBeNull();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("keeps an empty class empty and allows retry after a failed download", async () => {
  const ui = render(<ClassroomResources resources={[]} roomId="live-room" source="live" />);
  expect(screen.getByText("Le professeur n’a pas encore partagé de ressource.")).toBeVisible();
  expect(screen.queryByText("Exemples de démonstration")).not.toBeInTheDocument();
  vi.mocked(downloadClassroomResource).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  const resource = createClassroomDemoResources()[0];
  ui.rerender(<ClassroomResources resources={[resource]} roomId="live-room" source="live" />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Téléchargement indisponible");
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(downloadClassroomResource).toHaveBeenLastCalledWith(resource,"live-room","live");
});

it("prevents repeated downloads while access is being resolved", async () => {
  let finish!: () => void;
  vi.mocked(downloadClassroomResource).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<ClassroomResources resources={[createClassroomDemoResources()[0]]} roomId="demo-class" source="demo" />);
  const button = screen.getByRole("button");
  fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(downloadClassroomResource).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(button).toBeEnabled());
});
