import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArtistGroupsWorkspace, {
  type ArtistGroupChatLiveController,
  type ArtistGroup,
  type ArtistGroupsWorkspaceLiveController,
} from "./ArtistGroupsWorkspace";

const GROUP_ID = "71000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "72000000-0000-4000-8000-000000000001";
const MEMBER_ID = "73000000-0000-4000-8000-000000000001";
const INVITEE_ID = "73000000-0000-4000-8000-000000000002";
const SECOND_GROUP_ID = "71000000-0000-4000-8000-000000000002";
const SECOND_CONVERSATION_ID = "72000000-0000-4000-8000-000000000002";

function liveGroup(): ArtistGroup {
  return {
    id: GROUP_ID,
    name: "Midnight Echo",
    style: "Groupe d’artistes • Beatmaker",
    description: "Collectif live",
    cover: "/images/messaging/groups/group_1.png",
    statusInfo: "2 membres",
    lastMessage: "Discussion du groupe",
    messages: [],
    relatedProjectIds: [],
    members: [{
      id: MEMBER_ID,
      name: "Luna",
      role: "Chanteuse",
      avatar: "/avatars/utilisateur.png",
      online: false,
      authorityRole: "member",
    }],
    server: {
      conversationId: CONVERSATION_ID,
      authorityRole: "owner",
      visibility: "private",
      lifecycle: "active",
      notificationsEnabled: true,
      rosterVisibility: "visible",
      personallyArchived: false,
      pendingInvitationCount: 0,
    },
  };
}

function liveChatController(overrides: Partial<ArtistGroupChatLiveController> = {}): ArtistGroupChatLiveController {
  return {
    selectedConversationId: CONVERSATION_ID,
    messages: [],
    status: "ready",
    error: null,
    actionError: null,
    clearActionError: vi.fn(),
    refresh: vi.fn(async () => []),
    sendText: vi.fn(async () => "76000000-0000-4000-8000-000000000001"),
    retryMessage: vi.fn(async () => true),
    attachments: {
      queue: [],
      enqueue: vi.fn(() => "77000000-0000-4000-8000-000000000001"),
      retry: vi.fn(async () => true),
      discard: vi.fn(async () => true),
      sendReadyMessage: vi.fn(async () => ({ messageId: "78000000-0000-4000-8000-000000000001" })),
      resolveUrl: vi.fn(async () => "https://signed.example.test/private-file"),
      clearSent: vi.fn(),
    },
    ...overrides,
  };
}

function liveController(overrides: Partial<ArtistGroupsWorkspaceLiveController> = {}): ArtistGroupsWorkspaceLiveController {
  return {
    groups: [liveGroup()],
    invitations: [],
    activity: [],
    selectedGroupId: null,
    status: "ready",
    detailStatus: "idle",
    error: null,
    actionError: null,
    contacts: [],
    contactsStatus: "ready",
    contactsError: null,
    searchContacts: vi.fn(async () => []),
    openGroup: vi.fn(async () => null),
    createGroup: vi.fn(async () => null),
    updateGroup: vi.fn(async () => null),
    inviteMember: vi.fn(async () => null),
    respondInvitation: vi.fn(async () => null),
    cancelInvitation: vi.fn(async () => null),
    setPreferences: vi.fn(async () => null),
    setAuthorityRole: vi.fn(async () => null),
    setArtisticRole: vi.fn(async () => null),
    removeMember: vi.fn(async () => null),
    leaveGroup: vi.fn(async () => null),
    setGroupArchived: vi.fn(async () => null),
    deleteGroup: vi.fn(async () => null),
    clearActionError: vi.fn(),
    chat: liveChatController(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("ArtistGroupsWorkspace live", () => {
  it("charge le détail réel et crée le groupe sans injecter les candidats démo", async () => {
    const controller = liveController();
    const onItemsChange = vi.fn();
    const { rerender } = render(
      <ArtistGroupsWorkspace createGroupSignal={0} liveController={controller} onItemsChange={onItemsChange} />,
    );

    await waitFor(() => expect(controller.openGroup).toHaveBeenCalledWith(GROUP_ID));
    rerender(<ArtistGroupsWorkspace createGroupSignal={1} liveController={controller} onItemsChange={onItemsChange} />);
    await screen.findByPlaceholderText("Ex : Midnight Echo");
    fireEvent.change(screen.getByPlaceholderText("Ex : Midnight Echo"), { target: { value: "Aurora Club" } });
    fireEvent.change(screen.getByPlaceholderText("Ex : Collectif Hip-Hop • Trap"), { target: { value: "DJ" } });
    fireEvent.click(screen.getByRole("button", { name: /CONTINUER/i }));
    expect(screen.getByText(/Aucun avatar de démonstration ne sera ajouté/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /CONTINUER/i }));
    fireEvent.click(screen.getByRole("button", { name: /CRÉER LE GROUPE/i }));

    await waitFor(() => expect(controller.createGroup).toHaveBeenCalledWith({
      name: "Aurora Club",
      description: null,
      visibility: "private",
      artisticRole: "DJ",
    }));
    expect(onItemsChange).not.toHaveBeenCalled();
  });

  it("accepte ou refuse les invitations reçues via le contrôleur serveur", () => {
    const controller = liveController({
      invitations: [{
        id: "74000000-0000-4000-8000-000000000001",
        groupId: "71000000-0000-4000-8000-000000000002",
        groupName: "Neon Pulse",
        conversationId: "72000000-0000-4000-8000-000000000002",
        inviterProfileId: MEMBER_ID,
        inviterName: "Luna",
        inviterAvatar: "/avatars/utilisateur.png",
        artisticRole: "DJ",
        message: "Rejoins-nous",
        expiresAt: "2026-07-25T12:00:00Z",
        cursor: { created_at: "2026-07-18T12:00:00Z", invitation_id: "74000000-0000-4000-8000-000000000001" },
        server: {} as never,
      }],
    });
    render(<ArtistGroupsWorkspace liveController={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
    expect(controller.respondInvitation).toHaveBeenCalledWith("74000000-0000-4000-8000-000000000001", "accept");
  });

  it("câble invitations sortantes, rôles artistiques et autorité sans modifier le mock", async () => {
    const controller = liveController({
      contacts: [{
        id: INVITEE_ID,
        username: "nadir",
        displayName: "Nadir",
        avatar: "/avatars/utilisateur.png",
        role: "Beatmaker",
        online: true,
      }],
    });
    render(<ArtistGroupsWorkspace liveController={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Membres" }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir l’invitation d’un membre" }));
    fireEvent.change(screen.getByPlaceholderText("Nom ou @identifiant"), { target: { value: "Na" } });
    expect(controller.searchContacts).toHaveBeenCalledWith("Na");
    fireEvent.click(screen.getByRole("button", { name: /Nadir/ }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer l’invitation" }));
    await waitFor(() => expect(controller.inviteMember).toHaveBeenCalledWith(GROUP_ID, INVITEE_ID));

    fireEvent.click(screen.getByRole("button", { name: "Options Luna" }));
    fireEvent.click(screen.getByRole("button", { name: "Changer le rôle artistique" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Nouveau rôle" }), { target: { value: "DJ" } });
    await waitFor(() => expect(controller.setArtisticRole).toHaveBeenCalledWith(GROUP_ID, MEMBER_ID, "DJ"));

    fireEvent.click(screen.getByRole("button", { name: "Options Luna" }));
    fireEvent.click(screen.getByRole("button", { name: "Nommer administrateur" }));
    expect(controller.setAuthorityRole).toHaveBeenCalledWith(GROUP_ID, MEMBER_ID, "admin");
  });

  it("enregistre les préférences, la visibilité et l’archivage sur le serveur", () => {
    const controller = liveController();
    render(<ArtistGroupsWorkspace liveController={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Paramètres et options du groupe" }));
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(controller.setPreferences).toHaveBeenCalledWith({ groupId: GROUP_ID, notificationsEnabled: false });

    fireEvent.click(screen.getByRole("button", { name: /Confidentialité/ }));
    expect(controller.updateGroup).toHaveBeenCalledWith(GROUP_ID, {
      name: "Midnight Echo",
      description: "Collectif live",
      visibility: "discoverable",
    });

    fireEvent.click(screen.getByRole("button", { name: /Visibilité de la liste des membres/ }));
    expect(controller.setPreferences).toHaveBeenCalledWith({ groupId: GROUP_ID, rosterVisibility: "hidden" });
    fireEvent.click(screen.getByRole("button", { name: /Archiver le groupe/ }));
    expect(controller.setGroupArchived).toHaveBeenCalledWith(GROUP_ID, true);
  });

  it("laisse planning, votes et projets explicitement non persistants puis câble quitter et supprimer", async () => {
    const controller = liveController();
    const onItemsChange = vi.fn();
    render(<ArtistGroupsWorkspace liveController={controller} onItemsChange={onItemsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Planning" }));
    expect(screen.getByText(/Aucune donnée de démonstration ne sera enregistrée/)).toBeInTheDocument();
    expect(onItemsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Paramètres et options du groupe" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitter le groupe" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    await waitFor(() => expect(controller.leaveGroup).toHaveBeenCalledWith(GROUP_ID));

    fireEvent.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(controller.deleteGroup).toHaveBeenCalledWith(GROUP_ID, "Midnight Echo"));
  });

  it("conserve Planning quand la liste sélectionne un autre groupe", async () => {
    const firstGroup = liveGroup();
    const secondGroup: ArtistGroup = {
      ...liveGroup(),
      id: SECOND_GROUP_ID,
      name: "Neon Pulse",
      server: {
        ...liveGroup().server!,
        conversationId: SECOND_CONVERSATION_ID,
      },
    };
    const controller = liveController({ groups: [firstGroup, secondGroup] });
    const { rerender } = render(<ArtistGroupsWorkspace liveController={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Planning" }));
    expect(screen.getByRole("button", { name: "Planning" })).toHaveClass("is-active");

    rerender(
      <ArtistGroupsWorkspace
        liveController={controller}
        openGroupRequest={{ token: 2, groupId: SECOND_GROUP_ID }}
      />,
    );

    await waitFor(() => expect(controller.openGroup).toHaveBeenCalledWith(SECOND_GROUP_ID));
    expect(screen.getByLabelText("Espaces de Neon Pulse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Planning" })).toHaveClass("is-active");
    expect(screen.getByText(/Aucune donnée de démonstration ne sera enregistrée/)).toBeInTheDocument();
  });

  it("affiche et envoie les messages Supabase sans muter les messages de démonstration", async () => {
    const sendText = vi.fn(async () => "76000000-0000-4000-8000-000000000001");
    const group = liveGroup();
    group.messages = [{ id: "demo-only", sender: "Démo", body: "Message de démonstration", time: "10:00" }];
    const controller = liveController({
      groups: [group],
      chat: liveChatController({
        sendText,
        messages: [{ id: "server-message", author: "them", kind: "text", body: "Message Supabase du groupe", time: "12:30" }],
      }),
    });
    const onItemsChange = vi.fn();
    render(<ArtistGroupsWorkspace liveController={controller} onItemsChange={onItemsChange} />);

    expect(screen.getByText("Message Supabase du groupe")).toBeInTheDocument();
    expect(screen.queryByText("Message de démonstration")).not.toBeInTheDocument();
    fireEvent.input(screen.getByRole("textbox", { name: "Message pour Midnight Echo" }), { target: { textContent: "Bonsoir le groupe" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));

    await waitFor(() => expect(sendText).toHaveBeenCalledWith("Bonsoir le groupe"));
    expect(onItemsChange).not.toHaveBeenCalled();
  });

  it("réessaie un message live échoué avec son identifiant client stable", () => {
    const retryMessage = vi.fn(async () => true);
    const controller = liveController({
      chat: liveChatController({
        retryMessage,
        messages: [{
          id: "pending:76000000-0000-4000-8000-000000000002",
          sourceId: "76000000-0000-4000-8000-000000000002",
          author: "me",
          kind: "text",
          body: "Message à réessayer",
          time: "12:31",
          deliveryStatus: "failed",
        }],
      }),
    });
    render(<ArtistGroupsWorkspace liveController={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Échec · Réessayer" }));
    expect(retryMessage).toHaveBeenCalledWith("76000000-0000-4000-8000-000000000002");
  });

  it("prépare et publie une pièce jointe privée sans créer de faux message local", async () => {
    const file = new File(["audio"], "ready.wav", { type: "audio/wav" });
    const enqueue = vi.fn(() => "77000000-0000-4000-8000-000000000002");
    const sendReadyMessage = vi.fn(async () => ({ messageId: "78000000-0000-4000-8000-000000000002" }));
    const controller = liveController({
      chat: liveChatController({
        attachments: {
          queue: [{
            id: "77000000-0000-4000-8000-000000000001",
            file,
            purpose: "audio",
            displayName: "ready.wav",
            mimeType: "audio/wav",
            sizeBytes: file.size,
            durationMs: null,
            status: "ready",
            progress: 1,
            prepared: null,
            finalized: null,
            storageUploaded: true,
            error: null,
            conversationId: CONVERSATION_ID,
            collaborationRecipientProfileId: null,
          }],
          enqueue,
          retry: vi.fn(async () => true),
          discard: vi.fn(async () => true),
          sendReadyMessage,
          resolveUrl: vi.fn(async () => "https://signed.example.test/ready.wav"),
          clearSent: vi.fn(),
        },
      }),
    });
    const { container } = render(<ArtistGroupsWorkspace liveController={controller} />);
    const newFile = new File(["take"], "take.wav", { type: "audio/wav" });

    fireEvent.click(screen.getByRole("button", { name: "Ajouter une pièce jointe" }));
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [newFile] } });
    expect(enqueue).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID, file: newFile, purpose: "audio" });
    expect(screen.queryByText("📎 take.wav")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(sendReadyMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONVERSATION_ID,
      clientMessageId: "77000000-0000-4000-8000-000000000001",
      kind: "audio",
      body: "ready.wav",
      attachmentItemIds: ["77000000-0000-4000-8000-000000000001"],
    })));
  });

  it("ne résout l’URL signée d’une pièce jointe serveur qu’après une action explicite", async () => {
    const resolveUrl = vi.fn(async () => "https://signed.example.test/stems.wav");
    const controller = liveController({
      chat: liveChatController({
        attachments: { ...liveChatController().attachments!, resolveUrl },
        messages: [{
          id: "server-attachment",
          author: "them",
          kind: "audio",
          body: "stems.wav",
          time: "12:40",
          attachments: [{
            id: "attachment-1",
            mediaFileId: "media-1",
            available: true,
            order: 0,
            role: "primary",
            purpose: "audio",
            mediaType: "audio",
            displayName: "stems.wav",
            mimeType: "audio/wav",
            sizeBytes: 5,
            durationMs: null,
            bpm: null,
            musicalKey: null,
            label: null,
            metadata: {},
            privateObject: { bucket: "messaging-private", path: "group/stems.wav" },
          }],
        }],
      }),
    });
    render(<ArtistGroupsWorkspace liveController={controller} />);

    expect(resolveUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir stems.wav" }));
    await waitFor(() => expect(resolveUrl).toHaveBeenCalledTimes(1));
  });
});
