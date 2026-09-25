import {
  createMessagingClientMessageId,
  createMessagingIdempotencyKey,
  createMessagingRepository,
  type MessagingRepository,
} from "../../../messaging/messaging.service";

export type ClassroomPrivateMessageInput = {
  roomId: string;
  recipientId: string;
  body: string;
  source: "demo" | "live";
};

export type ClassroomPrivateMessageAttempt = {
  roomId: string;
  recipientId: string;
  body: string;
  conversationId?: string;
  idempotencyKey: string;
  clientMessageId: string;
};

type ClassroomMessagingRepository = Pick<
  MessagingRepository,
  "getOrCreateClassroomDirectConversation" | "sendTextMessage"
>;

export function createClassroomPrivateMessageAttempt(
  roomId: string,
  recipientId: string,
  body: string,
): ClassroomPrivateMessageAttempt {
  return {
    roomId: roomId.trim(),
    recipientId: recipientId.trim(),
    body: body.trim(),
    idempotencyKey: createMessagingIdempotencyKey("classe-direct"),
    clientMessageId: createMessagingClientMessageId(),
  };
}

export async function sendClassroomPrivateMessage(
  input: ClassroomPrivateMessageInput,
  attempt: ClassroomPrivateMessageAttempt,
  repository: ClassroomMessagingRepository = createMessagingRepository(),
) {
  const roomId = input.roomId.trim();
  const recipientId = input.recipientId.trim();
  const body = input.body.trim();
  if (!roomId || roomId.length > 128 || !recipientId || recipientId.length > 128) {
    throw new Error("class_private_message_recipient_invalid");
  }
  if (!body || body.length > 280) throw new Error("class_private_message_invalid");
  if (attempt.roomId !== roomId || attempt.recipientId !== recipientId || attempt.body !== body) {
    throw new Error("class_private_message_attempt_mismatch");
  }

  // The isolated Classe demo must remain fully usable without creating fake
  // conversations in the user's real Messaging account.
  if (input.source === "demo") {
    return { conversationId: null, messageId: null, demo: true as const };
  }

  if (!attempt.conversationId) {
    const conversation = await repository.getOrCreateClassroomDirectConversation(
      roomId,
      recipientId,
      attempt.idempotencyKey,
    );
    if (!conversation.ok || !conversation.conversation_id) {
      throw new Error("class_private_message_conversation_failed");
    }
    attempt.conversationId = conversation.conversation_id;
  }
  const message = await repository.sendTextMessage({
    conversationId: attempt.conversationId,
    clientMessageId: attempt.clientMessageId,
    body,
    payload: {
      context: "room_classe",
      room_id: roomId,
    },
  });
  if (!message.ok || !message.message_id) throw new Error("class_private_message_send_failed");
  return {
    conversationId: attempt.conversationId,
    messageId: message.message_id,
    demo: false as const,
  };
}
