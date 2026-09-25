SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION "public"."check_golden_like_cooldown"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  last_given_at TIMESTAMPTZ;
BEGIN
  -- Chercher le dernier golden like donné par ce user
  SELECT given_at INTO last_given_at
  FROM public.daily_golden_likes
  WHERE giver_id = NEW.giver_id
  ORDER BY given_at DESC
  LIMIT 1;

  -- Si on en trouve un, on vérifie si 24h se sont écoulées
  IF last_given_at IS NOT NULL AND (now() - last_given_at) < interval '24 hours' THEN
    RAISE EXCEPTION 'Golden Like en cooldown. Revenez dans %', 
      (interval '24 hours' - (now() - last_given_at));
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."check_golden_like_cooldown"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_follow_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, from_user_id, content)
  VALUES (
    NEW.following_id,
    'follow',
    NEW.follower_id,
    'started following you'
  );
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."create_follow_notification"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id, username, full_name, email,
    avatar_url, avatar_name, artist_type,
    street, city, postal_code, country, latitude, longitude
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'avatar_name',
    NEW.raw_user_meta_data->>'artist_type',
    NEW.raw_user_meta_data->>'street',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'postal_code',
    NEW.raw_user_meta_data->>'country',
    (NEW.raw_user_meta_data->>'latitude')::DOUBLE PRECISION,
    (NEW.raw_user_meta_data->>'longitude')::DOUBLE PRECISION
  );
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."prevent_invalid_room_ban_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_host_id UUID;
BEGIN
  SELECT host_id INTO target_host_id
  FROM public.rooms_v2
  WHERE id = NEW.room_id;

  IF target_host_id IS NOT NULL AND NEW.user_id = target_host_id THEN
    RAISE EXCEPTION 'Impossible de bannir le host de la room';
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."prevent_invalid_room_ban_v2"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_follow_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Incrémenter following_count du follower
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    -- Incrémenter followers_count du suivi
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Décrémenter
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
ALTER FUNCTION "public"."update_follow_counts"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_room_participants_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Nouveau participant qui rejoint
    UPDATE public.rooms_v2
    SET participants_count = participants_count + 1
    WHERE id = NEW.room_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Si left_at vient d'être set (quitter la room)
    IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN
      UPDATE public.rooms_v2
      SET participants_count = GREATEST(participants_count - 1, 0)
      WHERE id = NEW.room_id;
    -- Si left_at vient d'être unset (rejoindre à nouveau, edge case)
    ELSIF OLD.left_at IS NOT NULL AND NEW.left_at IS NULL THEN
      UPDATE public.rooms_v2
      SET participants_count = participants_count + 1
      WHERE id = NEW.room_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Suppression brutale (cas rare, ex: cleanup) — on décrémente seulement si pas déjà left
    IF OLD.left_at IS NULL THEN
      UPDATE public.rooms_v2
      SET participants_count = GREATEST(participants_count - 1, 0)
      WHERE id = OLD.room_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
ALTER FUNCTION "public"."update_room_participants_count"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."daily_golden_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "giver_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "given_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_golden_likes_check" CHECK (("giver_id" <> "recipient_id"))
);
ALTER TABLE "public"."daily_golden_likes" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."follows" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."media_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "format" "text",
    "file_size" integer DEFAULT 0,
    "duration_ms" integer,
    "file_url" "text" NOT NULL,
    "cover_url" "text",
    "folder_id" "uuid",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."media_files" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "from_user_id" "uuid",
    "content" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."notifications" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "birth_date" "date",
    "avatar_url" "text",
    "avatar_name" "text",
    "artist_type" "text",
    "profile_image_url" "text",
    "bio" "text",
    "talents" "jsonb" DEFAULT '[]'::"jsonb",
    "street" "text",
    "city" "text",
    "postal_code" "text",
    "country" "text",
    "latitude" double precision,
    "longitude" double precision,
    "is_ghost_mode" boolean DEFAULT false,
    "is_online" boolean DEFAULT false,
    "followers_count" integer DEFAULT 0,
    "following_count" integer DEFAULT 0,
    "grade" integer DEFAULT 1,
    "show_on_public_profile" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "social_links" "jsonb" DEFAULT '{}'::"jsonb",
    "is_verified" boolean DEFAULT false,
    "selected_audio_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "selected_video_ids" "jsonb" DEFAULT '[]'::"jsonb"
);
ALTER TABLE "public"."profiles" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_bans_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text",
    "banned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "room_bans_v2_no_self_ban" CHECK ((("banned_by" IS NULL) OR ("banned_by" <> "user_id")))
);
ALTER TABLE ONLY "public"."room_bans_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_bans_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_events_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "triggered_by" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."room_events_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_invitations_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "host_id" "uuid" NOT NULL,
    "guest_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "ready_at" timestamp with time zone,
    "backstage_at" timestamp with time zone,
    "onstage_at" timestamp with time zone,
    "ended_at" timestamp with time zone
);
ALTER TABLE ONLY "public"."room_invitations_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_invitations_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_messages_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_highlighted" boolean DEFAULT false NOT NULL,
    "highlight_expires_at" timestamp with time zone,
    "is_system" boolean DEFAULT false NOT NULL
);
ALTER TABLE ONLY "public"."room_messages_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_messages_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_mixer_state_v2" (
    "room_id" "uuid" NOT NULL,
    "guest_id" "uuid" NOT NULL,
    "is_mic_muted" boolean DEFAULT false NOT NULL,
    "is_video_off" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_music_muted" boolean DEFAULT false NOT NULL,
    "mic_gain" real DEFAULT 1.0 NOT NULL,
    "music_gain" real DEFAULT 1.0 NOT NULL,
    CONSTRAINT "room_mixer_state_v2_mic_gain_check" CHECK ((("mic_gain" >= (0)::double precision) AND ("mic_gain" <= (1)::double precision))),
    CONSTRAINT "room_mixer_state_v2_music_gain_check" CHECK ((("music_gain" >= (0)::double precision) AND ("music_gain" <= (1)::double precision)))
);
ALTER TABLE "public"."room_mixer_state_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_moderators_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE ONLY "public"."room_moderators_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_moderators_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_participants_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "left_at" timestamp with time zone
);
ALTER TABLE ONLY "public"."room_participants_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_participants_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_poll_votes_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "option_index" integer NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE ONLY "public"."room_poll_votes_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_poll_votes_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_polls_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "host_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer DEFAULT 30 NOT NULL
);
ALTER TABLE ONLY "public"."room_polls_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_polls_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_queue_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "preview_url" "text",
    "joined_queue_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone
);
ALTER TABLE ONLY "public"."room_queue_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_queue_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."room_reactions_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "emoji" "text"
);
ALTER TABLE ONLY "public"."room_reactions_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."room_reactions_v2" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."rooms_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "host_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "cover_url" "text",
    "status" "text" DEFAULT 'live'::"text" NOT NULL,
    "livekit_room_name" "text" NOT NULL,
    "participants_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "video_format" "text" DEFAULT 'landscape'::"text" NOT NULL,
    "queue_open" boolean DEFAULT true NOT NULL,
    "now_playing_title" "text",
    "now_playing_artist" "text",
    "now_playing_started_at" timestamp with time zone,
    "slow_mode_delay" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "rooms_v2_video_format_check" CHECK (("video_format" = ANY (ARRAY['landscape'::"text", 'portrait'::"text"])))
);
ALTER TABLE ONLY "public"."rooms_v2" REPLICA IDENTITY FULL;
ALTER TABLE "public"."rooms_v2" OWNER TO "postgres";
ALTER TABLE ONLY "public"."daily_golden_likes"
    ADD CONSTRAINT "daily_golden_likes_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");
ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."media_files"
    ADD CONSTRAINT "media_files_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");
ALTER TABLE ONLY "public"."room_bans_v2"
    ADD CONSTRAINT "room_bans_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_bans_v2"
    ADD CONSTRAINT "room_bans_v2_room_id_user_id_key" UNIQUE ("room_id", "user_id");
ALTER TABLE ONLY "public"."room_events_v2"
    ADD CONSTRAINT "room_events_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_invitations_v2"
    ADD CONSTRAINT "room_invitations_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_invitations_v2"
    ADD CONSTRAINT "room_invitations_v2_room_id_guest_id_key" UNIQUE ("room_id", "guest_id");
ALTER TABLE ONLY "public"."room_messages_v2"
    ADD CONSTRAINT "room_messages_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_mixer_state_v2"
    ADD CONSTRAINT "room_mixer_state_v2_pkey" PRIMARY KEY ("room_id", "guest_id");
ALTER TABLE ONLY "public"."room_moderators_v2"
    ADD CONSTRAINT "room_moderators_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_moderators_v2"
    ADD CONSTRAINT "room_moderators_v2_room_id_user_id_key" UNIQUE ("room_id", "user_id");
ALTER TABLE ONLY "public"."room_participants_v2"
    ADD CONSTRAINT "room_participants_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."room_participants_v2"
    ADD CONSTRAINT "room_participants_v2_role_check" CHECK (("role" = ANY (ARRAY['host'::"text", 'guest'::"text", 'viewer'::"text"]))) NOT VALID;
ALTER TABLE ONLY "public"."room_participants_v2"
    ADD CONSTRAINT "room_participants_v2_room_id_user_id_key" UNIQUE ("room_id", "user_id");
ALTER TABLE ONLY "public"."room_poll_votes_v2"
    ADD CONSTRAINT "room_poll_votes_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_poll_votes_v2"
    ADD CONSTRAINT "room_poll_votes_v2_poll_id_user_id_key" UNIQUE ("poll_id", "user_id");
ALTER TABLE ONLY "public"."room_polls_v2"
    ADD CONSTRAINT "room_polls_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_queue_v2"
    ADD CONSTRAINT "room_queue_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."room_queue_v2"
    ADD CONSTRAINT "room_queue_v2_room_id_user_id_key" UNIQUE ("room_id", "user_id");
ALTER TABLE ONLY "public"."room_reactions_v2"
    ADD CONSTRAINT "room_reactions_v2_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."rooms_v2"
    ADD CONSTRAINT "rooms_v2_livekit_room_name_key" UNIQUE ("livekit_room_name");
ALTER TABLE ONLY "public"."rooms_v2"
    ADD CONSTRAINT "rooms_v2_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_follows_follower" ON "public"."follows" USING "btree" ("follower_id");
CREATE INDEX "idx_follows_following" ON "public"."follows" USING "btree" ("following_id");
CREATE INDEX "idx_golden_likes_giver" ON "public"."daily_golden_likes" USING "btree" ("giver_id", "given_at" DESC);
CREATE INDEX "idx_golden_likes_recipient" ON "public"."daily_golden_likes" USING "btree" ("recipient_id");
CREATE INDEX "idx_media_files_user" ON "public"."media_files" USING "btree" ("user_id", "type");
CREATE INDEX "idx_mixer_state_room" ON "public"."room_mixer_state_v2" USING "btree" ("room_id");
CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);
CREATE INDEX "idx_profiles_artist_type" ON "public"."profiles" USING "btree" ("artist_type");
CREATE INDEX "idx_profiles_location" ON "public"."profiles" USING "btree" ("latitude", "longitude") WHERE ("latitude" IS NOT NULL);
CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");
CREATE INDEX "idx_room_events_v2_room_recent" ON "public"."room_events_v2" USING "btree" ("room_id", "created_at" DESC);
CREATE INDEX "idx_room_invitations_v2_guest" ON "public"."room_invitations_v2" USING "btree" ("guest_id");
CREATE INDEX "idx_room_invitations_v2_room" ON "public"."room_invitations_v2" USING "btree" ("room_id");
CREATE INDEX "idx_room_invitations_v2_status" ON "public"."room_invitations_v2" USING "btree" ("room_id", "status");
CREATE INDEX "idx_room_messages_v2_highlighted" ON "public"."room_messages_v2" USING "btree" ("room_id") WHERE ("is_highlighted" = true);
CREATE INDEX "idx_room_messages_v2_room" ON "public"."room_messages_v2" USING "btree" ("room_id", "created_at" DESC);
CREATE INDEX "idx_room_participants_v2_active" ON "public"."room_participants_v2" USING "btree" ("room_id") WHERE ("left_at" IS NULL);
CREATE INDEX "idx_room_participants_v2_room" ON "public"."room_participants_v2" USING "btree" ("room_id");
CREATE INDEX "idx_room_participants_v2_user" ON "public"."room_participants_v2" USING "btree" ("user_id");
CREATE INDEX "idx_room_poll_votes_v2_poll" ON "public"."room_poll_votes_v2" USING "btree" ("poll_id");
CREATE INDEX "idx_room_polls_v2_room_active" ON "public"."room_polls_v2" USING "btree" ("room_id") WHERE ("is_active" = true);
CREATE INDEX "idx_room_queue_v2_active" ON "public"."room_queue_v2" USING "btree" ("room_id", "joined_queue_at" DESC) WHERE ("removed_at" IS NULL);
CREATE INDEX "idx_room_queue_v2_room" ON "public"."room_queue_v2" USING "btree" ("room_id");
CREATE INDEX "idx_room_reactions_v2_room_recent" ON "public"."room_reactions_v2" USING "btree" ("room_id", "created_at" DESC);
CREATE INDEX "idx_room_reactions_v2_room_type" ON "public"."room_reactions_v2" USING "btree" ("room_id", "type");
CREATE INDEX "idx_rooms_v2_host" ON "public"."rooms_v2" USING "btree" ("host_id");
CREATE INDEX "idx_rooms_v2_livekit_name" ON "public"."rooms_v2" USING "btree" ("livekit_room_name");
CREATE INDEX "idx_rooms_v2_status" ON "public"."rooms_v2" USING "btree" ("status");
CREATE INDEX "idx_rooms_v2_status_type" ON "public"."rooms_v2" USING "btree" ("status", "type");
CREATE INDEX "idx_rooms_v2_type" ON "public"."rooms_v2" USING "btree" ("type");
CREATE OR REPLACE TRIGGER "on_follow_change" AFTER INSERT OR DELETE ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."update_follow_counts"();
CREATE OR REPLACE TRIGGER "on_new_follow_notification" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."create_follow_notification"();
CREATE OR REPLACE TRIGGER "on_room_participant_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."room_participants_v2" FOR EACH ROW EXECUTE FUNCTION "public"."update_room_participants_count"();
CREATE OR REPLACE TRIGGER "prevent_invalid_room_ban_v2" BEFORE INSERT OR UPDATE ON "public"."room_bans_v2" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_invalid_room_ban_v2"();
CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "rooms_v2_updated_at" BEFORE UPDATE ON "public"."rooms_v2" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
CREATE OR REPLACE TRIGGER "trg_check_golden_like_cooldown" BEFORE INSERT ON "public"."daily_golden_likes" FOR EACH ROW EXECUTE FUNCTION "public"."check_golden_like_cooldown"();
ALTER TABLE ONLY "public"."daily_golden_likes"
    ADD CONSTRAINT "daily_golden_likes_giver_id_fkey" FOREIGN KEY ("giver_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."daily_golden_likes"
    ADD CONSTRAINT "daily_golden_likes_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."media_files"
    ADD CONSTRAINT "media_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_bans_v2"
    ADD CONSTRAINT "room_bans_v2_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."room_bans_v2"
    ADD CONSTRAINT "room_bans_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_bans_v2"
    ADD CONSTRAINT "room_bans_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_events_v2"
    ADD CONSTRAINT "room_events_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_events_v2"
    ADD CONSTRAINT "room_events_v2_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_invitations_v2"
    ADD CONSTRAINT "room_invitations_v2_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_invitations_v2"
    ADD CONSTRAINT "room_invitations_v2_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_invitations_v2"
    ADD CONSTRAINT "room_invitations_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_messages_v2"
    ADD CONSTRAINT "room_messages_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_messages_v2"
    ADD CONSTRAINT "room_messages_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_mixer_state_v2"
    ADD CONSTRAINT "room_mixer_state_v2_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_mixer_state_v2"
    ADD CONSTRAINT "room_mixer_state_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_moderators_v2"
    ADD CONSTRAINT "room_moderators_v2_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."room_moderators_v2"
    ADD CONSTRAINT "room_moderators_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_moderators_v2"
    ADD CONSTRAINT "room_moderators_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_participants_v2"
    ADD CONSTRAINT "room_participants_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_participants_v2"
    ADD CONSTRAINT "room_participants_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_poll_votes_v2"
    ADD CONSTRAINT "room_poll_votes_v2_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."room_polls_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_poll_votes_v2"
    ADD CONSTRAINT "room_poll_votes_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_polls_v2"
    ADD CONSTRAINT "room_polls_v2_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_polls_v2"
    ADD CONSTRAINT "room_polls_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_queue_v2"
    ADD CONSTRAINT "room_queue_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_queue_v2"
    ADD CONSTRAINT "room_queue_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_reactions_v2"
    ADD CONSTRAINT "room_reactions_v2_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms_v2"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_reactions_v2"
    ADD CONSTRAINT "room_reactions_v2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."rooms_v2"
    ADD CONSTRAINT "rooms_v2_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
CREATE POLICY "Changer son vote" ON "public"."room_poll_votes_v2" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."room_polls_v2" "p"
     JOIN "public"."room_bans_v2" "b" ON (("b"."room_id" = "p"."room_id")))
  WHERE (("p"."id" = "room_poll_votes_v2"."poll_id") AND ("b"."user_id" = "auth"."uid"())))))));
CREATE POLICY "Créer des notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);
CREATE POLICY "Créer sa propre room" ON "public"."rooms_v2" FOR INSERT WITH CHECK (("auth"."uid"() = "host_id"));
CREATE POLICY "Donner un golden like" ON "public"."daily_golden_likes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "giver_id"));
CREATE POLICY "Envoyer un message" ON "public"."room_messages_v2" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (COALESCE("is_system", false) = false) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."room_bans_v2" "b"
  WHERE (("b"."room_id" = "room_messages_v2"."room_id") AND ("b"."user_id" = "auth"."uid"())))))));
CREATE POLICY "Envoyer un message système" ON "public"."room_messages_v2" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (COALESCE("is_system", false) = true) AND ((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_messages_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_messages_v2"."room_id") AND ("m"."user_id" = "auth"."uid"())))))));
CREATE POLICY "Follow" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));
CREATE POLICY "Gérer ses fichiers" ON "public"."media_files" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Host controle mixer" ON "public"."room_mixer_state_v2" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."rooms_v2"
  WHERE (("rooms_v2"."id" = "room_mixer_state_v2"."room_id") AND ("rooms_v2"."host_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rooms_v2"
  WHERE (("rooms_v2"."id" = "room_mixer_state_v2"."room_id") AND ("rooms_v2"."host_id" = "auth"."uid"())))));
CREATE POLICY "Host crée sondage" ON "public"."room_polls_v2" FOR INSERT WITH CHECK (("auth"."uid"() = "host_id"));
CREATE POLICY "Host invite" ON "public"."room_invitations_v2" FOR INSERT WITH CHECK (("auth"."uid"() = "host_id"));
CREATE POLICY "Host supprime invitation" ON "public"."room_invitations_v2" FOR DELETE USING (("auth"."uid"() = "host_id"));
CREATE POLICY "Host supprime sondage" ON "public"."room_polls_v2" FOR DELETE USING (("auth"."uid"() = "host_id"));
CREATE POLICY "Host trigger event" ON "public"."room_events_v2" FOR INSERT WITH CHECK ((("auth"."uid"() = "triggered_by") AND (EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_events_v2"."room_id") AND ("r"."host_id" = "auth"."uid"()))))));
CREATE POLICY "Host update messages" ON "public"."room_messages_v2" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_messages_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_messages_v2"."room_id") AND ("m"."user_id" = "auth"."uid"())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_messages_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_messages_v2"."room_id") AND ("m"."user_id" = "auth"."uid"()))))));
CREATE POLICY "Host update sondage" ON "public"."room_polls_v2" FOR UPDATE USING (("auth"."uid"() = "host_id"));
CREATE POLICY "Insertion de son propre profil" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));
CREATE POLICY "L'utilisateur peut modifier son propre profil" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));
CREATE POLICY "Le host et les mods peuvent bannir" ON "public"."room_bans_v2" USING (((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_bans_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_bans_v2"."room_id") AND ("m"."user_id" = "auth"."uid"())))))) WITH CHECK ((("banned_by" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_bans_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_bans_v2"."room_id") AND ("m"."user_id" = "auth"."uid"())))))));
CREATE POLICY "Le host peut modifier les participants de sa room" ON "public"."room_participants_v2" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_participants_v2"."room_id") AND ("r"."host_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_participants_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))));
CREATE POLICY "Le host peut nommer/retirer un modérateur" ON "public"."room_moderators_v2" USING ((EXISTS ( SELECT 1
   FROM "public"."rooms_v2"
  WHERE (("rooms_v2"."id" = "room_moderators_v2"."room_id") AND ("rooms_v2"."host_id" = "auth"."uid"())))));
CREATE POLICY "Les modérateurs peuvent modifier les participants" ON "public"."room_participants_v2" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_participants_v2"."room_id") AND ("m"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_participants_v2"."room_id") AND ("m"."user_id" = "auth"."uid"())))));
CREATE POLICY "Marquer comme lu" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Modifier sa propre room" ON "public"."rooms_v2" FOR UPDATE USING (("auth"."uid"() = "host_id"));
CREATE POLICY "Modifier ses fichiers" ON "public"."media_files" FOR UPDATE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Quitter une room" ON "public"."room_participants_v2" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."room_bans_v2" "b"
  WHERE (("b"."room_id" = "room_participants_v2"."room_id") AND ("b"."user_id" = "auth"."uid"()))))) AND (("role" = 'viewer'::"text") OR (("role" = 'host'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_participants_v2"."room_id") AND ("r"."host_id" = "auth"."uid"()))))))));
CREATE POLICY "Rejoindre la file" ON "public"."room_queue_v2" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_queue_v2"."room_id") AND ("r"."queue_open" = true)))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."room_bans_v2" "b"
  WHERE (("b"."room_id" = "room_queue_v2"."room_id") AND ("b"."user_id" = "auth"."uid"())))))));
CREATE POLICY "Rejoindre une room" ON "public"."room_participants_v2" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."room_bans_v2" "b"
  WHERE (("b"."room_id" = "room_participants_v2"."room_id") AND ("b"."user_id" = "auth"."uid"()))))) AND (("role" = 'viewer'::"text") OR (("role" = 'host'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_participants_v2"."room_id") AND ("r"."host_id" = "auth"."uid"()))))))));
CREATE POLICY "Réagir" ON "public"."room_reactions_v2" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."room_bans_v2" "b"
  WHERE (("b"."room_id" = "room_reactions_v2"."room_id") AND ("b"."user_id" = "auth"."uid"())))))));
CREATE POLICY "Supprimer sa propre room" ON "public"."rooms_v2" FOR DELETE USING (("auth"."uid"() = "host_id"));
CREATE POLICY "Supprimer ses fichiers" ON "public"."media_files" FOR DELETE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Tout le monde peut voir les profils" ON "public"."profiles" FOR SELECT USING (true);
CREATE POLICY "Unfollow" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));
CREATE POLICY "Update file" ON "public"."room_queue_v2" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_queue_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_queue_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))) OR (("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."room_bans_v2" "b"
  WHERE (("b"."room_id" = "room_queue_v2"."room_id") AND ("b"."user_id" = "auth"."uid"()))))))));
CREATE POLICY "Update invitation" ON "public"."room_invitations_v2" FOR UPDATE USING ((("auth"."uid"() = "host_id") OR ("auth"."uid"() = "guest_id")));
CREATE POLICY "Voir la file" ON "public"."room_queue_v2" FOR SELECT USING (true);
CREATE POLICY "Voir le mixer" ON "public"."room_mixer_state_v2" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Voir les bans" ON "public"."room_bans_v2" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."rooms_v2" "r"
  WHERE (("r"."id" = "room_bans_v2"."room_id") AND ("r"."host_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."room_moderators_v2" "m"
  WHERE (("m"."room_id" = "room_bans_v2"."room_id") AND ("m"."user_id" = "auth"."uid"()))))));
CREATE POLICY "Voir les events" ON "public"."room_events_v2" FOR SELECT USING (true);
CREATE POLICY "Voir les fichiers publics" ON "public"."media_files" FOR SELECT USING ((("is_public" = true) OR ("auth"."uid"() = "user_id")));
CREATE POLICY "Voir les follows" ON "public"."follows" FOR SELECT USING (true);
CREATE POLICY "Voir les invitations" ON "public"."room_invitations_v2" FOR SELECT USING (true);
CREATE POLICY "Voir les messages" ON "public"."room_messages_v2" FOR SELECT USING (true);
CREATE POLICY "Voir les modérateurs" ON "public"."room_moderators_v2" FOR SELECT USING (true);
CREATE POLICY "Voir les participants d'une room" ON "public"."room_participants_v2" FOR SELECT USING (true);
CREATE POLICY "Voir les réactions" ON "public"."room_reactions_v2" FOR SELECT USING (true);
CREATE POLICY "Voir les sondages" ON "public"."room_polls_v2" FOR SELECT USING (true);
CREATE POLICY "Voir les votes" ON "public"."room_poll_votes_v2" FOR SELECT USING (true);
CREATE POLICY "Voir ses golden likes" ON "public"."daily_golden_likes" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "giver_id") OR ("auth"."uid"() = "recipient_id")));
CREATE POLICY "Voir ses notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Voir toutes les rooms" ON "public"."rooms_v2" FOR SELECT USING (true);
CREATE POLICY "Voter" ON "public"."room_poll_votes_v2" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."room_polls_v2" "p"
     JOIN "public"."room_bans_v2" "b" ON (("b"."room_id" = "p"."room_id")))
  WHERE (("p"."id" = "room_poll_votes_v2"."poll_id") AND ("b"."user_id" = "auth"."uid"())))))));
ALTER TABLE "public"."daily_golden_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_bans_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_events_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_invitations_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_messages_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_mixer_state_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_moderators_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_participants_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_poll_votes_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_polls_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_queue_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_reactions_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rooms_v2" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."daily_golden_likes";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."follows";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_bans_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_events_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_invitations_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_messages_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_mixer_state_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_moderators_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_participants_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_poll_votes_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_polls_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_queue_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_reactions_v2";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."rooms_v2";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON FUNCTION "public"."check_golden_like_cooldown"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_golden_like_cooldown"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_golden_like_cooldown"() TO "service_role";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."prevent_invalid_room_ban_v2"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_invalid_room_ban_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_invalid_room_ban_v2"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_follow_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_follow_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_follow_counts"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_room_participants_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_room_participants_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_room_participants_count"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";
GRANT ALL ON TABLE "public"."daily_golden_likes" TO "anon";
GRANT ALL ON TABLE "public"."daily_golden_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_golden_likes" TO "service_role";
GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";
GRANT ALL ON TABLE "public"."media_files" TO "anon";
GRANT ALL ON TABLE "public"."media_files" TO "authenticated";
GRANT ALL ON TABLE "public"."media_files" TO "service_role";
GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT ALL ON TABLE "public"."room_bans_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_bans_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_bans_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_events_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_events_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_events_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_invitations_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_invitations_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_invitations_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_messages_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_messages_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_messages_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_mixer_state_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_mixer_state_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_mixer_state_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_moderators_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_moderators_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_moderators_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_participants_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_participants_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_participants_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_poll_votes_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_poll_votes_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_poll_votes_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_polls_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_polls_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_polls_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_queue_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_queue_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_queue_v2" TO "service_role";
GRANT ALL ON TABLE "public"."room_reactions_v2" TO "anon";
GRANT ALL ON TABLE "public"."room_reactions_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."room_reactions_v2" TO "service_role";
GRANT ALL ON TABLE "public"."rooms_v2" TO "anon";
GRANT ALL ON TABLE "public"."rooms_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms_v2" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
drop extension if exists "pg_net";
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
create policy "Delete own queue preview"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'room-queue-previews'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Delete own room cover"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'room-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Read queue previews"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'room-queue-previews'::text));
create policy "Read room covers"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'room-covers'::text));
create policy "Upload queue preview"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'room-queue-previews'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Upload room cover"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'room-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
