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
    // Get all bot tokens
    const { data: bots } = await sb.from("bot_tokens").select("id, token, user_id, admin_telegram_id");
    if (!bots || bots.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No bots" }));
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const bot of bots) {
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

      // Get active subscribers
      const { data: allSubs } = await sb.from("telegram_subscribers")
        .select("telegram_user_id, is_permanent, expires_at, first_name, last_name, telegram_username")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId);

      const now = new Date();
      const activeUserIds = new Set<number>();
      const expiredUsers: { telegram_user_id: number; name: string }[] = [];

      for (const s of (allSubs || [])) {
        if (s.is_permanent || (s.expires_at && new Date(s.expires_at) > now)) {
          activeUserIds.add(s.telegram_user_id);
        } else if (s.expires_at && new Date(s.expires_at) < now) {
          expiredUsers.push({
            telegram_user_id: s.telegram_user_id,
            name: [s.first_name, s.last_name].filter(Boolean).join(" ") || s.telegram_username || String(s.telegram_user_id),
          });
        }
      }

      // Add active free trial users
      const { data: ftUsers } = await sb.from("free_trial_users")
        .select("telegram_user_id, expires_at")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId);
      for (const ft of (ftUsers || [])) {
        if (ft.expires_at && new Date(ft.expires_at) > now) {
          activeUserIds.add(ft.telegram_user_id);
        }
      }

      // Get all known members from channel_members
      const { data: members } = await sb.from("channel_members")
        .select("telegram_user_id, first_name, last_name, telegram_username, channel_id")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId);

      // Build non-subscriber set from channel members
      const nonSubMembers = new Map<number, string>();
      for (const m of (members || [])) {
        if (!activeUserIds.has(m.telegram_user_id) && !nonSubMembers.has(m.telegram_user_id)) {
          nonSubMembers.set(
            m.telegram_user_id,
            [m.first_name, m.last_name].filter(Boolean).join(" ") || m.telegram_username || String(m.telegram_user_id),
          );
        }
      }

      const kickedUsers: { telegram_user_id: number; name: string }[] = [];
      const kickedExpired: { telegram_user_id: number; name: string }[] = [];

      // Kick non-subscribers from all channels
      for (const ch of channels) {
        // Get channel admins to exclude
        const adminIds = new Set<number>();
        try {
          const res = await tg(botToken, "getChatAdministrators", { chat_id: ch.channel_id });
          if (res.ok) {
            for (const a of res.result) adminIds.add(a.user.id);
          }
        } catch {}

        // Kick non-subscribers
        for (const [uid, name] of nonSubMembers) {
          if (adminIds.has(uid)) continue;
          if (adminTgId && uid === adminTgId) continue;
          try {
            const banRes = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: uid });
            if (banRes.ok) {
              tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: uid, only_if_banned: true }).catch(() => {});
              if (!kickedUsers.some(u => u.telegram_user_id === uid)) {
                kickedUsers.push({ telegram_user_id: uid, name });
              }
            }
          } catch {}
          await sleep(200);
        }

        // Kick expired subscribers
        for (const exp of expiredUsers) {
          if (adminIds.has(exp.telegram_user_id)) continue;
          try {
            const banRes = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: exp.telegram_user_id });
            if (banRes.ok) {
              tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: exp.telegram_user_id, only_if_banned: true }).catch(() => {});
              if (!kickedExpired.some(u => u.telegram_user_id === exp.telegram_user_id)) {
                kickedExpired.push(exp);
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

      // Save scan log to database
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
