import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (_req) => {
  try {
    const { data: bots } = await sb.from("bot_tokens").select("id, token, user_id, admin_telegram_id, auto_scan_enabled, auto_scan_interval");
    if (!bots || bots.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No bots" }));
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const bot of bots) {
      if (!bot.auto_scan_enabled) continue;

      const botToken = bot.token;
      const botTokenId = bot.id;
      const ownerId = bot.user_id;
      const adminTgId = bot.admin_telegram_id;

      // Get all channels
      const { data: channels } = await sb.from("telegram_channels")
        .select("id, channel_id, channel_name")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId);

      if (!channels || channels.length === 0) continue;

      // Get all subscribers with their assigned channels
      const { data: allSubs } = await sb.from("telegram_subscribers")
        .select("id, telegram_user_id, is_permanent, expires_at, first_name, last_name, telegram_username")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId);

      // Get subscriber-channel assignments
      const { data: subChannels } = await sb.from("subscriber_channels")
        .select("subscriber_id, channel_id")
        .in("subscriber_id", (allSubs || []).map(s => s.id));

      // Build map: subscriber_id -> assigned channel_ids
      const subChannelMap = new Map<string, Set<string>>();
      for (const sc of (subChannels || [])) {
        if (!subChannelMap.has(sc.subscriber_id)) {
          subChannelMap.set(sc.subscriber_id, new Set());
        }
        subChannelMap.get(sc.subscriber_id)!.add(sc.channel_id);
      }

      const now = new Date();

      // Build per-channel active user sets
      // A user is active for a channel if:
      // 1. They have an active subscription (permanent or not expired)
      // 2. AND they are assigned to that channel (or have no specific assignments = all channels)
      const perChannelActiveUsers = new Map<string, Set<number>>(); // channel db id -> active user telegram ids
      const expiredUsers: { telegram_user_id: number; name: string }[] = [];
      const expiredUserIds = new Set<number>();

      for (const ch of channels) {
        perChannelActiveUsers.set(ch.id, new Set());
      }

      for (const s of (allSubs || [])) {
        const isActive = s.is_permanent || (s.expires_at && new Date(s.expires_at) > now);
        
        if (isActive) {
          const assignedChannels = subChannelMap.get(s.id);
          if (!assignedChannels || assignedChannels.size === 0) {
            // No specific assignment = access to ALL channels
            for (const ch of channels) {
              perChannelActiveUsers.get(ch.id)!.add(s.telegram_user_id);
            }
          } else {
            // Only add to assigned channels
            for (const chId of assignedChannels) {
              if (perChannelActiveUsers.has(chId)) {
                perChannelActiveUsers.get(chId)!.add(s.telegram_user_id);
              }
            }
          }
        } else if (s.expires_at && new Date(s.expires_at) < now) {
          if (!expiredUserIds.has(s.telegram_user_id)) {
            expiredUserIds.add(s.telegram_user_id);
            expiredUsers.push({
              telegram_user_id: s.telegram_user_id,
              name: [s.first_name, s.last_name].filter(Boolean).join(" ") || s.telegram_username || String(s.telegram_user_id),
            });
          }
        }
      }

      // Add active free trial users to all channels
      const { data: ftUsers } = await sb.from("free_trial_users")
        .select("telegram_user_id, expires_at")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId);
      for (const ft of (ftUsers || [])) {
        if (ft.expires_at && new Date(ft.expires_at) > now) {
          for (const ch of channels) {
            perChannelActiveUsers.get(ch.id)!.add(ft.telegram_user_id);
          }
        }
      }

      // Get all known members from channel_members
      const { data: members } = await sb.from("channel_members")
        .select("telegram_user_id, first_name, last_name, telegram_username, channel_id")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId);

      const kickedUsers: { telegram_user_id: number; name: string }[] = [];
      const kickedExpired: { telegram_user_id: number; name: string }[] = [];

      for (const ch of channels) {
        // Get channel admins to exclude
        const adminIds = new Set<number>();
        try {
          const res = await tg(botToken, "getChatAdministrators", { chat_id: ch.channel_id });
          if (res.ok) {
            for (const a of res.result) adminIds.add(a.user.id);
          }
        } catch {}

        const activeForThisChannel = perChannelActiveUsers.get(ch.id)!;

        // Get members of this specific channel
        const channelMembers = (members || []).filter(m => m.channel_id === ch.id);

        // Kick non-active members from this channel
        for (const m of channelMembers) {
          if (adminIds.has(m.telegram_user_id)) continue;
          if (adminTgId && m.telegram_user_id === adminTgId) continue;
          if (activeForThisChannel.has(m.telegram_user_id)) continue;

          const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.telegram_username || String(m.telegram_user_id);
          const isExpired = expiredUserIds.has(m.telegram_user_id);

          try {
            const banRes = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: m.telegram_user_id });
            if (banRes.ok) {
              tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: m.telegram_user_id, only_if_banned: true }).catch(() => {});
              
              if (isExpired) {
                if (!kickedExpired.some(u => u.telegram_user_id === m.telegram_user_id)) {
                  kickedExpired.push({ telegram_user_id: m.telegram_user_id, name });
                }
              } else {
                if (!kickedUsers.some(u => u.telegram_user_id === m.telegram_user_id)) {
                  kickedUsers.push({ telegram_user_id: m.telegram_user_id, name });
                }
              }
            }
          } catch {}
          await sleep(200);
        }
      }

      // Notify admin
      if (adminTgId && (kickedUsers.length > 0 || kickedExpired.length > 0)) {
        let msg = `🔄 *تقرير الفحص التلقائي*\n\n`;

        if (kickedUsers.length > 0) {
          const names = kickedUsers.map((u, i) => `${i + 1}. ${u.name}`).join("\n");
          msg += `🚫 *غير مشتركين تم طردهم (${kickedUsers.length}):*\n${names}\n\n`;
        }

        if (kickedExpired.length > 0) {
          const names = kickedExpired.map((u, i) => `${i + 1}. ${u.name}`).join("\n");
          msg += `⏰ *منتهي اشتراكهم تم طردهم (${kickedExpired.length}):*\n${names}`;
        }

        if (msg.length < 4000) {
          await tg(botToken, "sendMessage", { chat_id: adminTgId, text: msg, parse_mode: "Markdown" }).catch(() => {});
        } else {
          await tg(botToken, "sendMessage", {
            chat_id: adminTgId,
            text: `🔄 *تقرير الفحص التلقائي*\n\nتم طرد *${kickedUsers.length}* غير مشترك و *${kickedExpired.length}* منتهي الاشتراك.`,
            parse_mode: "Markdown",
          }).catch(() => {});
        }
      }

      // Save scan log
      await sb.from("scan_logs").insert({
        owner_id: ownerId,
        bot_token_id: botTokenId,
        kicked_non_subscribers: kickedUsers.length,
        kicked_expired: kickedExpired.length,
        details: {
          kicked_non_subscribers_list: kickedUsers,
          kicked_expired_list: kickedExpired,
          channels_scanned: channels.length,
        },
      });

      console.log(`Bot ${botTokenId}: kicked ${kickedUsers.length} non-subs, ${kickedExpired.length} expired`);
    }

    return new Response(JSON.stringify({ ok: true }));
  } catch (err: any) {
    console.error("Auto-scan error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
