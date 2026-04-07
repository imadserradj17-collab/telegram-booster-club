import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(supabaseUrl, supabaseServiceKey);

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
        const BATCH_SIZE = 20;
        for (let i = 0; i < activeSubs.length; i += BATCH_SIZE) {
          const batch = activeSubs.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((sub: any) =>
            tg(botToken, "sendMessage", { chat_id: sub.telegram_user_id, text: message, parse_mode: "Markdown" })
          ));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value?.ok) sent++;
            else failed++;
          }
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

      // ── KICK FROM ALL CHANNELS ──
      case "kick_from_channels": {
        const { subscriber_id } = params;
        if (!subscriber_id) {
          return new Response(JSON.stringify({ error: "subscriber_id required" }), { status: 400, headers: corsHeaders });
        }

        const { data: sub } = await sb.from("telegram_subscribers").select("id, telegram_user_id, bot_token_id").eq("id", subscriber_id).eq("owner_id", user.id).single();
        if (!sub) {
          return new Response(JSON.stringify({ error: "Subscriber not found" }), { status: 404, headers: corsHeaders });
        }

        // Always kick from ALL owner channels/groups for this bot
        const { data: allChannels } = await sb.from("telegram_channels")
          .select("channel_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", sub.bot_token_id || botData.id);

        const kickSet = new Set<number>();
        for (const ch of (allChannels || [])) {
          if (ch.channel_id) kickSet.add(ch.channel_id);
        }

        let kicked = 0, failedKick = 0;
        console.log(`Kicking user ${sub.telegram_user_id} from ${kickSet.size} channels: ${[...kickSet].join(", ")}`);
        for (const chId of kickSet) {
          try {
            console.log(`Banning user ${sub.telegram_user_id} from channel ${chId}...`);
            const banRes = await tg(botToken, "banChatMember", { chat_id: chId, user_id: sub.telegram_user_id });
            console.log(`Ban result for channel ${chId}:`, JSON.stringify(banRes));
            if (banRes.ok) {
              kicked++;
              const unbanRes = await tg(botToken, "unbanChatMember", { chat_id: chId, user_id: sub.telegram_user_id, only_if_banned: true });
              console.log(`Unban result for channel ${chId}:`, JSON.stringify(unbanRes));
            } else { failedKick++; }
          } catch (e: any) { console.error(`Kick error for channel ${chId}:`, e.message); failedKick++; }
        }

        return new Response(JSON.stringify({ ok: true, kicked, failed: failedKick }), { headers: corsHeaders });
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

      // ── GET PUBLIC CHANNEL MEMBERS COUNT ──
      case "get_public_members_count": {
        const { count } = await sb.from("public_channel_members")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        return new Response(JSON.stringify({ ok: true, count: count || 0 }), { headers: corsHeaders });
      }

      // ── KICK ALL EXPIRED SUBSCRIBERS FROM ALL CHANNELS ──
      case "kick_expired_from_channels": {
        // Get all expired subscribers
        const { data: expiredSubs } = await sb.from("telegram_subscribers")
          .select("id, telegram_user_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .eq("is_permanent", false)
          .not("expires_at", "is", null);

        const nowDate = new Date();
        const expired = (expiredSubs || []).filter((s: any) => new Date(s.expires_at) < nowDate);

        if (expired.length === 0) {
          return new Response(JSON.stringify({ ok: true, kicked: 0, failed: 0, total: 0 }), { headers: corsHeaders });
        }

        // Get all channels for this owner/bot
        const { data: allChs } = await sb.from("telegram_channels")
          .select("channel_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const chIds = (allChs || []).map((c: any) => c.channel_id).filter(Boolean);
        if (chIds.length === 0) {
          return new Response(JSON.stringify({ ok: true, kicked: 0, failed: 0, total: expired.length, message: "No channels" }), { headers: corsHeaders });
        }

        let kicked = 0, failedKick = 0;
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        for (const sub of expired) {
          for (const chId of chIds) {
            try {
              const banRes = await tg(botToken, "banChatMember", { chat_id: chId, user_id: sub.telegram_user_id });
              if (banRes.ok) {
                kicked++;
                await tg(botToken, "unbanChatMember", { chat_id: chId, user_id: sub.telegram_user_id, only_if_banned: true });
              } else { failedKick++; }
            } catch { failedKick++; }
            await sleep(300);
          }
          await sleep(500);
        }

        return new Response(JSON.stringify({ ok: true, kicked, failed: failedKick, total: expired.length }), { headers: corsHeaders });
      }

      // ── UNBAN ALL FROM ALL CHANNELS ──
      case "unban_all_from_channels": {
        // Get all channels for this owner/bot
        const { data: allChsUnban } = await sb.from("telegram_channels")
          .select("channel_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const chIdsUnban = (allChsUnban || []).map((c: any) => c.channel_id).filter(Boolean);
        if (chIdsUnban.length === 0) {
          return new Response(JSON.stringify({ ok: true, unbanned: 0, failed: 0, message: "No channels" }), { headers: corsHeaders });
        }

        // Collect all known user IDs: subscribers + bot_users + public_channel_members
        const [subsU, buU, pcmU] = await Promise.all([
          sb.from("telegram_subscribers").select("telegram_user_id").eq("owner_id", user.id).eq("bot_token_id", botTokenId),
          sb.from("bot_users").select("telegram_user_id").eq("owner_id", user.id).eq("bot_token_id", botTokenId),
          sb.from("public_channel_members").select("telegram_user_id").eq("owner_id", user.id).eq("bot_token_id", botTokenId),
        ]);

        const allUserIds = new Set<number>();
        for (const s of (subsU.data || [])) allUserIds.add(s.telegram_user_id);
        for (const b of (buU.data || [])) allUserIds.add(b.telegram_user_id);
        for (const p of (pcmU.data || [])) allUserIds.add(p.telegram_user_id);

        if (allUserIds.size === 0) {
          return new Response(JSON.stringify({ ok: true, unbanned: 0, failed: 0, total: 0 }), { headers: corsHeaders });
        }

        let unbanned = 0, failedUnban = 0;
        const BATCH_SIZE = 5;
        const userArr = [...allUserIds];
        for (let i = 0; i < userArr.length; i += BATCH_SIZE) {
          const batch = userArr.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(batch.map(async (uid) => {
            for (const chId of chIdsUnban) {
              try {
                const res = await tg(botToken, "unbanChatMember", { chat_id: chId, user_id: uid, only_if_banned: true });
                if (res.ok) unbanned++; else failedUnban++;
              } catch { failedUnban++; }
            }
          }));
        }

        return new Response(JSON.stringify({ ok: true, unbanned, failed: failedUnban, total: allUserIds.size }), { headers: corsHeaders });
      }

      // ── KICK ALL PUBLIC CHANNEL MEMBERS ──
      case "kick_public_members": {
        // Get the public channel setting
        const publicChId = botData.public_channel_id;
        if (!publicChId) {
          return new Response(JSON.stringify({ error: "No public channel configured" }), { status: 400, headers: corsHeaders });
        }

        // Get the telegram channel_id
        const { data: pubChannel } = await sb.from("telegram_channels").select("channel_id").eq("id", publicChId).single();
        if (!pubChannel) {
          return new Response(JSON.stringify({ error: "Public channel not found" }), { status: 404, headers: corsHeaders });
        }

        // Get all public channel members
        const { data: members } = await sb.from("public_channel_members")
          .select("telegram_user_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .eq("channel_id", publicChId);

        const allMembers = members || [];
        let kicked = 0, failed = 0;
        const CONCURRENCY = 10;

        for (let i = 0; i < allMembers.length; i += CONCURRENCY) {
          const batch = allMembers.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(batch.map(async (m: any) => {
            const banRes = await tg(botToken, "banChatMember", { chat_id: pubChannel.channel_id, user_id: m.telegram_user_id });
            if (banRes.ok) {
              await tg(botToken, "unbanChatMember", { chat_id: pubChannel.channel_id, user_id: m.telegram_user_id, only_if_banned: true });
              return true;
            }
            return false;
          }));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) kicked++; else failed++;
          }
        }

        // Delete all public channel member records after kicking
        await sb.from("public_channel_members")
          .delete()
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .eq("channel_id", publicChId);

        return new Response(JSON.stringify({ ok: true, kicked, failed, total: allMembers.length }), { headers: corsHeaders });
      }

      case "kick_trial_user": {
        const { telegram_user_id } = params;
        if (!telegram_user_id) return new Response(JSON.stringify({ error: "Missing telegram_user_id" }), { status: 400, headers: corsHeaders });

        // Send notification before kicking
        try {
          await tg(botToken, "sendMessage", {
            chat_id: telegram_user_id,
            text: "⛔ *تم إلغاء اشتراكك التجريبي.*\n\nتم إزالتك من جميع القنوات والمجموعات.\nللاشتراك تواصل مع المسؤول.",
            parse_mode: "Markdown",
          });
        } catch {}

        const { data: allChannels } = await sb.from("telegram_channels").select("channel_id").eq("owner_id", user.id).eq("bot_token_id", botTokenId);
        const channelIds = (allChannels || []).map((c: any) => c.channel_id);

        let kicked = 0, failed = 0;
        for (let i = 0; i < channelIds.length; i += 5) {
          const batch = channelIds.slice(i, i + 5);
          const results = await Promise.allSettled(batch.map(async (chId: number) => {
            const banRes = await tg(botToken, "banChatMember", { chat_id: chId, user_id: telegram_user_id });
            if (banRes.ok) {
              await tg(botToken, "unbanChatMember", { chat_id: chId, user_id: telegram_user_id, only_if_banned: true });
              return true;
            }
            return false;
          }));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) kicked++;
            else failed++;
          }
        }

        const { data: sub } = await sb.from("telegram_subscribers").select("id").eq("owner_id", user.id).eq("bot_token_id", botTokenId).eq("telegram_user_id", telegram_user_id).maybeSingle();
        if (sub) {
          await Promise.all([
            sb.from("subscriber_channels").delete().eq("subscriber_id", sub.id),
            sb.from("telegram_subscribers").delete().eq("id", sub.id),
          ]);
        }

        // Keep free_trial_users record so user cannot re-activate free trial
        return new Response(JSON.stringify({ ok: true, kicked, failed }), { headers: corsHeaders });
      }

      // ── CHECK BLOCKED SUBSCRIBERS & KICK ──
      case "check_blocked_subscribers": {
        // Get all active subscribers
        const { data: allSubs } = await sb.from("telegram_subscribers")
          .select("id, telegram_user_id, telegram_username, first_name, last_name")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const activeSubs2 = allSubs || [];
        if (activeSubs2.length === 0) {
          return new Response(JSON.stringify({ ok: true, blocked: 0, kicked: 0, failed: 0 }), { headers: corsHeaders });
        }

        // Get all channels
        const { data: allChs2 } = await sb.from("telegram_channels")
          .select("channel_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);
        const chIds2 = (allChs2 || []).map((c: any) => c.channel_id).filter(Boolean);

        const blockedUsers: any[] = [];
        const BATCH2 = 10;

        // Check each subscriber by trying to send a test action (getChat)
        for (let i = 0; i < activeSubs2.length; i += BATCH2) {
          const batch = activeSubs2.slice(i, i + BATCH2);
          await Promise.allSettled(batch.map(async (sub: any) => {
            try {
              const res = await tg(botToken, "sendChatAction", { chat_id: sub.telegram_user_id, action: "typing" });
              if (!res.ok && res.description?.includes("bot was blocked")) {
                blockedUsers.push(sub);
              }
            } catch {}
          }));
        }

        if (blockedUsers.length === 0) {
          return new Response(JSON.stringify({ ok: true, blocked: 0, kicked: 0, failed: 0 }), { headers: corsHeaders });
        }

        // Kick blocked users from all channels — parallel batches
        let kicked2 = 0, failed2 = 0;
        const kickTasks: { chId: number; userId: number }[] = [];
        for (const bUser of blockedUsers) {
          for (const chId of chIds2) {
            kickTasks.push({ chId, userId: bUser.telegram_user_id });
          }
        }
        const KICK_BATCH = 20;
        for (let i = 0; i < kickTasks.length; i += KICK_BATCH) {
          const batch = kickTasks.slice(i, i + KICK_BATCH);
          const results = await Promise.allSettled(batch.map(async ({ chId, userId }) => {
            const banRes = await tg(botToken, "banChatMember", { chat_id: chId, user_id: userId });
            if (banRes.ok) {
              tg(botToken, "unbanChatMember", { chat_id: chId, user_id: userId, only_if_banned: true }).catch(() => {});
              return true;
            }
            return false;
          }));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) kicked2++;
            else failed2++;
          }
        }

        return new Response(JSON.stringify({
          ok: true,
          blocked: blockedUsers.length,
          kicked: kicked2,
          failed: failed2,
          blocked_users: blockedUsers.map((u: any) => ({
            telegram_user_id: u.telegram_user_id,
            name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.telegram_username || String(u.telegram_user_id),
          })),
        }), { headers: corsHeaders });
      }

      // ── KICK NON-SUBSCRIBERS FROM ALL CHANNELS ──
      case "kick_non_subscribers": {
        const { data: allChsNS } = await sb.from("telegram_channels")
          .select("channel_id, channel_name")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const chListNS = (allChsNS || []).filter((c: any) => c.channel_id);
        if (chListNS.length === 0) {
          return new Response(JSON.stringify({ ok: true, kicked: 0, failed: 0, checked: 0, channels_results: [], kicked_users: [] }), { headers: corsHeaders });
        }

        // Get all active subscriber telegram_user_ids
        const { data: allSubsNS } = await sb.from("telegram_subscribers")
          .select("telegram_user_id, is_permanent, expires_at, first_name, last_name, telegram_username")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const nowNS = new Date();
        const activeUserIds = new Set<number>();
        const userInfoMap = new Map<number, string>();
        for (const s of (allSubsNS || [])) {
          const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || s.telegram_username || String(s.telegram_user_id);
          userInfoMap.set(s.telegram_user_id, name);
          if (s.is_permanent || (s.expires_at && new Date(s.expires_at) > nowNS)) {
            activeUserIds.add(s.telegram_user_id);
          }
        }

        const adminTgId = botData.admin_telegram_id;

        const knownUserIds = new Set<number>();
        const [buNS, pcmNS, ftNS] = await Promise.all([
          sb.from("bot_users").select("telegram_user_id, first_name, last_name, telegram_username").eq("owner_id", user.id).eq("bot_token_id", botTokenId),
          sb.from("public_channel_members").select("telegram_user_id, first_name, last_name, telegram_username").eq("owner_id", user.id).eq("bot_token_id", botTokenId),
          sb.from("free_trial_users").select("telegram_user_id, expires_at, first_name, last_name, telegram_username").eq("owner_id", user.id).eq("bot_token_id", botTokenId),
        ]);
        for (const b of (buNS.data || [])) {
          knownUserIds.add(b.telegram_user_id);
          if (!userInfoMap.has(b.telegram_user_id)) userInfoMap.set(b.telegram_user_id, [b.first_name, b.last_name].filter(Boolean).join(" ") || b.telegram_username || String(b.telegram_user_id));
        }
        for (const p of (pcmNS.data || [])) {
          knownUserIds.add(p.telegram_user_id);
          if (!userInfoMap.has(p.telegram_user_id)) userInfoMap.set(p.telegram_user_id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.telegram_username || String(p.telegram_user_id));
        }
        for (const ft of (ftNS.data || [])) {
          if (ft.expires_at && new Date(ft.expires_at) > nowNS) {
            activeUserIds.add(ft.telegram_user_id);
          }
        }

        const toKick = [...knownUserIds].filter(uid => {
          if (activeUserIds.has(uid)) return false;
          if (adminTgId && uid === adminTgId) return false;
          return true;
        });

        if (toKick.length === 0) {
          return new Response(JSON.stringify({ ok: true, kicked: 0, failed: 0, checked: knownUserIds.size, channels_results: [], kicked_users: [] }), { headers: corsHeaders });
        }

        // Get channel admins
        const channelAdmins = new Set<number>();
        await Promise.allSettled(chListNS.map(async (ch: any) => {
          try {
            const res = await tg(botToken, "getChatAdministrators", { chat_id: ch.channel_id });
            if (res.ok) for (const a of res.result) channelAdmins.add(a.user.id);
          } catch {}
        }));

        const finalKick = toKick.filter(uid => !channelAdmins.has(uid));

        // Track per-channel results and kicked users
        const channelsResults: { channel_name: string; channel_id: number; kicked: number; failed: number }[] = [];
        const kickedUserIds = new Set<number>();

        const KICK_B = 10;
        for (const ch of chListNS) {
          let chKicked = 0, chFailed = 0;
          for (let i = 0; i < finalKick.length; i += KICK_B) {
            const batch = finalKick.slice(i, i + KICK_B);
            await Promise.allSettled(batch.map(async (uid) => {
              try {
                const banRes = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: uid });
                if (banRes.ok) {
                  chKicked++;
                  kickedUserIds.add(uid);
                  tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: uid, only_if_banned: true }).catch(() => {});
                } else { chFailed++; }
              } catch { chFailed++; }
            }));
          }
          channelsResults.push({ channel_name: ch.channel_name, channel_id: ch.channel_id, kicked: chKicked, failed: chFailed });
        }

        const totalKicked = channelsResults.reduce((s, c) => s + c.kicked, 0);
        const totalFailed = channelsResults.reduce((s, c) => s + c.failed, 0);
        const kickedUsers = [...kickedUserIds].map(uid => ({
          telegram_user_id: uid,
          name: userInfoMap.get(uid) || String(uid),
        }));

        return new Response(JSON.stringify({
          ok: true,
          kicked: totalKicked,
          failed: totalFailed,
          checked: knownUserIds.size,
          channels_results: channelsResults,
          kicked_users: kickedUsers,
        }), { headers: corsHeaders });
      }

      // ── BROADCAST TO ALL CHANNELS ──
      case "broadcast_channels": {
        const { message } = params;
        if (!message?.trim()) {
          return new Response(JSON.stringify({ error: "Message required" }), { status: 400, headers: corsHeaders });
        }

        const { data: allChs } = await sb.from("telegram_channels")
          .select("channel_id, channel_name")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const chList = allChs || [];
        if (chList.length === 0) {
          return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0, total: 0 }), { headers: corsHeaders });
        }

        let sent = 0, failed = 0;
        for (const ch of chList) {
          try {
            const res = await tg(botToken, "sendMessage", { chat_id: ch.channel_id, text: message, parse_mode: "Markdown" });
            if (res.ok) sent++; else { console.log(`Failed to send to channel ${ch.channel_id}:`, JSON.stringify(res)); failed++; }
          } catch { failed++; }
        }

        return new Response(JSON.stringify({ ok: true, sent, failed, total: chList.length }), { headers: corsHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
