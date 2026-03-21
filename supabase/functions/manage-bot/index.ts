import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function supabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function tg(token: string, method: string, body?: any) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const sb = supabaseAdmin();
    const { action, ...params } = await req.json();

    // Get bot token for this user
    const { data: botData } = await sb.from("bot_tokens").select("*").eq("user_id", user.id).maybeSingle();
    if (!botData) {
      return new Response(JSON.stringify({ error: "No bot configured" }), { status: 400, headers: corsHeaders });
    }

    const botToken = botData.token;
    const botTokenId = botData.id;

    switch (action) {
      // ── ADD SUBSCRIBER ──
      case "add_subscriber": {
        const { telegram_user_id, telegram_username, first_name, last_name, days, is_permanent, channel_ids } = params;

        if (!telegram_user_id) {
          return new Response(JSON.stringify({ error: "telegram_user_id required" }), { status: 400, headers: corsHeaders });
        }

        const expiresAt = is_permanent ? null : new Date(Date.now() + (days || 30) * 86400000).toISOString();

        // Try to get photo
        let photoUrl = null;
        try {
          const photos = await tg(botToken, "getUserProfilePhotos", { user_id: telegram_user_id, limit: 1 });
          if (photos.ok && photos.result?.photos?.length) {
            const fileId = photos.result.photos[0][photos.result.photos[0].length - 1].file_id;
            const file = await tg(botToken, "getFile", { file_id: fileId });
            if (file.ok) photoUrl = `https://api.telegram.org/file/bot${botToken}/${file.result.file_path}`;
          }
        } catch {}

        const { data: sub, error } = await sb.from("telegram_subscribers").upsert(
          {
            owner_id: user.id,
            bot_token_id: botTokenId,
            telegram_user_id,
            telegram_username: telegram_username || null,
            first_name: first_name || null,
            last_name: last_name || null,
            photo_url: photoUrl,
            subscription_days: is_permanent ? null : (days || 30),
            expires_at: expiresAt,
            is_permanent: !!is_permanent,
          },
          { onConflict: "owner_id,telegram_user_id" }
        ).select("id").single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
        }

        // Assign channels
        await sb.from("subscriber_channels").delete().eq("subscriber_id", sub.id);
        if (channel_ids && channel_ids.length > 0) {
          const rows = channel_ids.map((chId: string) => ({ subscriber_id: sub.id, channel_id: chId }));
          await sb.from("subscriber_channels").insert(rows);
        }

        // Try to send invite links
        let notified = false;
        if (channel_ids && channel_ids.length > 0) {
          const { data: channels } = await sb.from("telegram_channels").select("channel_name, invite_link").in("id", channel_ids);
          const buttons = (channels || []).filter((ch: any) => ch.invite_link).map((ch: any) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);
          if (buttons.length > 0) {
            try {
              const sendRes = await tg(botToken, "sendMessage", {
                chat_id: telegram_user_id,
                text: "🎉 *تم تفعيل اشتراكك!*\n\nاضغط على الأزرار للانضمام:",
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: buttons },
              });
              notified = sendRes.ok === true;
            } catch {}
          }
        }

        return new Response(JSON.stringify({ ok: true, subscriber_id: sub.id, notified }), { headers: corsHeaders });
      }

      // ── BROADCAST ──
      case "broadcast": {
        const { message } = params;
        if (!message?.trim()) {
          return new Response(JSON.stringify({ error: "Message required" }), { status: 400, headers: corsHeaders });
        }

        const { data: subs } = await sb.from("telegram_subscribers")
          .select("telegram_user_id, is_permanent, expires_at")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const activeSubs = (subs || []).filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date()));

        let sent = 0, failed = 0;
        for (const sub of activeSubs) {
          try {
            const res = await tg(botToken, "sendMessage", { chat_id: sub.telegram_user_id, text: message, parse_mode: "Markdown" });
            if (res.ok) sent++; else failed++;
          } catch { failed++; }
        }

        return new Response(JSON.stringify({ ok: true, sent, failed, total: activeSubs.length }), { headers: corsHeaders });
      }

      // ── GET CHANNELS ──
      case "get_channels": {
        const { data: channels } = await sb.from("telegram_channels")
          .select("*")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .order("created_at", { ascending: false });

        return new Response(JSON.stringify({ ok: true, channels: channels || [] }), { headers: corsHeaders });
      }

      // ── DELETE CHANNEL ──
      case "delete_channel": {
        const { channel_id } = params;
        // Delete subscriber_channels first
        await sb.from("subscriber_channels").delete().eq("channel_id", channel_id);
        const { error } = await sb.from("telegram_channels").delete().eq("id", channel_id).eq("owner_id", user.id);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ── GET SUBSCRIBER CHANNELS ──
      case "get_subscriber_channels": {
        const { data: subChannels } = await sb.from("subscriber_channels")
          .select("subscriber_id, channel_id, telegram_channels(id, channel_name)")
          .eq("telegram_channels.owner_id", user.id);

        // Group by subscriber
        const grouped: Record<string, any[]> = {};
        for (const sc of (subChannels || [])) {
          if (!grouped[sc.subscriber_id]) grouped[sc.subscriber_id] = [];
          if (sc.telegram_channels) grouped[sc.subscriber_id].push(sc.telegram_channels);
        }

        return new Response(JSON.stringify({ ok: true, subscriber_channels: grouped }), { headers: corsHeaders });
      }

      // ── UPDATE SUBSCRIBER CHANNELS ──
      case "update_subscriber_channels": {
        const { subscriber_id, channel_ids: newChannelIds } = params;
        await sb.from("subscriber_channels").delete().eq("subscriber_id", subscriber_id);
        if (newChannelIds && newChannelIds.length > 0) {
          const rows = newChannelIds.map((chId: string) => ({ subscriber_id, channel_id: chId }));
          await sb.from("subscriber_channels").insert(rows);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ── BROADCAST TO ALL BOT USERS ──
      case "broadcast_all": {
        const { message } = params;
        if (!message?.trim()) {
          return new Response(JSON.stringify({ error: "Message required" }), { status: 400, headers: corsHeaders });
        }

        const { data: botUsers } = await sb.from("bot_users")
          .select("telegram_user_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const users = botUsers || [];
        let sent = 0, failed = 0;
        const CONCURRENCY = 10;
        for (let i = 0; i < users.length; i += CONCURRENCY) {
          const batch = users.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(batch.map(async (u: any) => {
            const res = await tg(botToken, "sendMessage", { chat_id: u.telegram_user_id, text: message, parse_mode: "Markdown" });
            return res.ok;
          }));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) sent++; else failed++;
          }
        }

        return new Response(JSON.stringify({ ok: true, sent, failed, total: users.length }), { headers: corsHeaders });
      }

      // ── GET BOT USERS COUNT ──
      case "get_bot_users": {
        const { data: botUsers } = await sb.from("bot_users")
          .select("id, telegram_user_id, telegram_username, first_name, last_name, created_at")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .order("created_at", { ascending: false });

        return new Response(JSON.stringify({ ok: true, bot_users: botUsers || [], count: (botUsers || []).length }), { headers: corsHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
