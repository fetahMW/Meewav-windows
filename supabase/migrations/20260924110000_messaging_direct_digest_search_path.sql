-- pgcrypto is installed in extensions on this project. The direct-conversation
-- RPC invokes digest() and previously searched only public and pg_temp.
alter function public.get_or_create_direct_conversation_v1(uuid, text)
  set search_path = public, extensions, pg_temp;
