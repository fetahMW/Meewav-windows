import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { SCENE_WATCH_LATER_PLAYLIST_ID, scenePlaylistRepository } from "../scenePlaylists";
import ScenePlaylistsView from "./ScenePlaylistsView";

const videos = [{
  id: "video-1",
  title: "Sous la lumière",
  artist: "Naya K.",
  image: "/video.webp",
  alt: "Naya K. sur scène",
  duration: "2:18",
}, {
  id: "video-2",
  title: "Sans filet",
  artist: "Alya Flow",
  image: "/video-2.webp",
  alt: "Alya Flow en session",
  duration: "2:42",
}];

function Harness({ onPlay = vi.fn() }: { onPlay?: (id: string) => void }) {
  const [selected, setSelected] = useState(SCENE_WATCH_LATER_PLAYLIST_ID);
  return (
    <ScenePlaylistsView
      videos={videos}
      selectedPlaylistId={selected}
      onSelectPlaylist={setSelected}
      onPlay={onPlay}
      onBack={vi.fn()}
      onNotify={vi.fn()}
    />
  );
}

describe("ScenePlaylistsView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    scenePlaylistRepository.clear();
  });
  afterEach(() => cleanup());

  it("creates a named playlist and manages a playable ordered selection", async () => {
    scenePlaylistRepository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-1");
    scenePlaylistRepository.addVideo(SCENE_WATCH_LATER_PLAYLIST_ID, "video-2");
    const onPlay = vi.fn();
    const user = userEvent.setup();
    render(<Harness onPlay={onPlay} />);

    const list = screen.getByRole("list");
    expect(within(list).getByText("Sous la lumière")).toBeVisible();
    await user.click(within(list).getByRole("button", { name: "Monter Sans filet" }));
    expect(scenePlaylistRepository.get(SCENE_WATCH_LATER_PLAYLIST_ID)?.videoIds)
      .toEqual(["video-2", "video-1"]);
    await user.click(within(list).getByRole("button", { name: /Naya K\. sur scène/ }));
    expect(onPlay).toHaveBeenCalledWith("video-1");

    await user.type(screen.getByRole("textbox", { name: "Nom de la nouvelle playlist" }), "Sessions du soir");
    await user.click(screen.getByRole("button", { name: "Créer la playlist" }));
    expect(screen.getByRole("heading", { name: "Sessions du soir" })).toBeVisible();
    expect(screen.getByText("Cette playlist est prête.")).toBeVisible();
  });
});
