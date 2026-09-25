import { createMessagingProjectIdempotencyKey } from "./messaging.projects.service";
import type {
  MessagingCreateProjectInput,
  MessagingInviteProjectMemberInput,
  MessagingProjectCreateResult,
  MessagingProjectInvitationResult,
} from "./messaging.projects.types";

export type MessagingProjectInviteDraft = Omit<
  MessagingInviteProjectMemberInput,
  "projectId" | "idempotencyKey"
>;

type InviteMember = (
  input: MessagingInviteProjectMemberInput,
) => Promise<MessagingProjectInvitationResult>;

type InvitationStep = {
  input: MessagingProjectInviteDraft;
  idempotencyKey: string;
  completed: boolean;
};

/**
 * Keeps one durable key per invitee and remembers acknowledged invitations.
 * If a request fails after the server committed it, replaying the same step is
 * safe because the RPC receives the exact same idempotency key and payload.
 */
export function createMessagingProjectInvitationAttempt(
  invitees: MessagingProjectInviteDraft[],
  scope = "project-invite",
) {
  const steps = Array.from(
    new Map(invitees.map((invitee) => [invitee.profileId, invitee])).values(),
    (invitee): InvitationStep => ({
      input: {
        ...invitee,
        permissions: { ...invitee.permissions },
      },
      idempotencyKey: createMessagingProjectIdempotencyKey(`${scope}:${invitee.profileId}`),
      completed: false,
    }),
  );
  let inFlight: Promise<void> | null = null;

  return {
    get pendingProfileIds() {
      return steps.filter((step) => !step.completed).map((step) => step.input.profileId);
    },

    async run(projectId: string, inviteMember: InviteMember) {
      if (inFlight) return inFlight;
      const operation = (async () => {
        for (const step of steps) {
          if (step.completed) continue;
          await inviteMember({
            ...step.input,
            projectId,
            permissions: { ...step.input.permissions },
            idempotencyKey: step.idempotencyKey,
          });
          step.completed = true;
        }
      })();
      inFlight = operation;
      try {
        await operation;
      } finally {
        if (inFlight === operation) inFlight = null;
      }
    },
  };
}

/**
 * A creation attempt lives as long as its wizard. Project creation and member
 * invitations can therefore resume after either an explicit or ambiguous
 * failure without changing keys or creating a second project.
 */
export function createMessagingProjectCreationAttempt(
  input: Omit<MessagingCreateProjectInput, "idempotencyKey">,
  invitees: MessagingProjectInviteDraft[],
) {
  const createInput: MessagingCreateProjectInput = {
    ...input,
    idempotencyKey: createMessagingProjectIdempotencyKey("project-create"),
  };
  const invitations = createMessagingProjectInvitationAttempt(
    invitees,
    "project-create-invite",
  );
  let project: MessagingProjectCreateResult | null = null;
  let inFlight: Promise<MessagingProjectCreateResult> | null = null;

  return {
    get pendingProfileIds() {
      return invitations.pendingProfileIds;
    },

    async run(actions: {
      createProject: (value: MessagingCreateProjectInput) => Promise<MessagingProjectCreateResult>;
      inviteMember: InviteMember;
    }) {
      if (inFlight) return inFlight;
      const operation = (async () => {
        if (!project) {
          project = await actions.createProject({ ...createInput });
        }
        await invitations.run(project.project_id, actions.inviteMember);
        return project;
      })();
      inFlight = operation;
      try {
        return await operation;
      } finally {
        if (inFlight === operation) inFlight = null;
      }
    },
  };
}
