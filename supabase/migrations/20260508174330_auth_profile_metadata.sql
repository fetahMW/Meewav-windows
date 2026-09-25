CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id, username, full_name, email, birth_date,
    avatar_url, avatar_name, artist_type,
    street, city, postal_code, country, latitude, longitude,
    is_ghost_mode, show_on_public_profile
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::date,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'avatar_name',
    NEW.raw_user_meta_data->>'artist_type',
    NEW.raw_user_meta_data->>'street',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'postal_code',
    NEW.raw_user_meta_data->>'country',
    NULLIF(NEW.raw_user_meta_data->>'latitude', '')::double precision,
    NULLIF(NEW.raw_user_meta_data->>'longitude', '')::double precision,
    COALESCE((NEW.raw_user_meta_data->>'is_ghost_mode')::boolean, true),
    COALESCE((NEW.raw_user_meta_data->>'show_on_public_profile')::boolean, false)
  );
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";
