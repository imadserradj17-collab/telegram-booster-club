import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth
      .getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { action, ...params } = await req.json();

    // Get bot token for this user
    const { data: botData } = await sb.from("bot_tokens").select("*").eq(
      "user_id",
      user.id,
    ).maybeSingle();
    if (!botData) {
      return new Response(JSON.stringify({ error: "No bot configured" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const botToken = botData.token;
    const botTokenId = botData.id;

    switch (action) {
      // ── ADD SUBSCRIBER ──
      case "add_subscriber": {
        const {
          telegram_user_id,
          telegram_username,
          first_name,
          last_name,
          days,
          is_permanent,
          channel_ids,
        } = params;

        if (!telegram_user_id) {
          return new Response(
            JSON.stringify({ error: "telegram_user_id required" }),
            { status: 400, headers: corsHeaders },
          );
        }

        const expiresAt = is_permanent
          ? null
          : new Date(Date.now() + (days || 30) * 86400000).toISOString();

        // Try to get photo
        let photoUrl = null;
        try {
          const photos = await tg(botToken, "getUserProfilePhotos", {
            user_id: telegram_user_id,
            limit: 1,
          });
          if (photos.ok && photos.result?.photos?.length) {
            const fileId =
              photos.result.photos[0][photos.result.photos[0].length - 1]
                .file_id;
            const file = await tg(botToken, "getFile", { file_id: fileId });
            if (file.ok) {
              photoUrl =
                `https://api.telegram.org/file/bot${botToken}/${file.result.file_path}`;
            }
          }
        } catch {}

        const { data: sub, error } = await sb.from("telegram_subscribers")
          .upsert(
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
            { onConflict: "owner_id,telegram_user_id" },
          ).select("id").single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders,
          });
        }

        // Assign channels
        await sb.from("subscriber_channels").delete().eq(
          "subscriber_id",
          sub.id,
        );
        if (channel_ids && channel_ids.length > 0) {
          const rows = channel_ids.map((chId: string) => ({
            subscriber_id: sub.id,
            channel_id: chId,
          }));
          await sb.from("subscriber_channels").insert(rows);
        }

        // Try to send invite links
        let notified = false;
        if (channel_ids && channel_ids.length > 0) {
          const { data: channels } = await sb.from("telegram_channels").select(
            "channel_name, invite_link",
          ).in("id", channel_ids);
          const buttons = (channels || []).filter((ch: any) => ch.invite_link)
            .map((
              ch: any,
            ) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);
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

        return new Response(
          JSON.stringify({ ok: true, subscriber_id: sub.id, notified }),
          { headers: corsHeaders },
        );
      }

      // ── BROADCAST ──
      case "broadcast": {
        const { message } = params;
        if (!message?.trim()) {
          return new Response(JSON.stringify({ error: "Message required" }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        // Send to everyone who activated the bot (pressed /start), regardless of subscription status
        const [{ data: botUsersRows }, { data: bannedRows }] = await Promise.all([
          sb.from("bot_users")
            .select("telegram_user_id")
            .eq("owner_id", user.id)
            .eq("bot_token_id", botTokenId),
          sb.from("bot_banned_users")
            .select("telegram_user_id")
            .eq("owner_id", user.id)
            .eq("bot_token_id", botTokenId),
        ]);

        const bannedSet = new Set(
          (bannedRows || []).map((b: any) => Number(b.telegram_user_id)),
        );

        const activeSubs = (botUsersRows || [])
          .filter((u: any) => !bannedSet.has(Number(u.telegram_user_id)))
          .map((u: any) => ({
            telegram_user_id: u.telegram_user_id,
          }));

        let sent = 0, failed = 0;
        const BATCH_SIZE = 20;
        for (let i = 0; i < activeSubs.length; i += BATCH_SIZE) {
          const batch = activeSubs.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async (sub: any) => {
              let res = await tg(botToken, "sendMessage", {
                chat_id: sub.telegram_user_id,
                text: message,
                parse_mode: "Markdown",
              });
              if (!res.ok && /can't parse|parse entities/i.test(res.description || "")) {
                res = await tg(botToken, "sendMessage", {
                  chat_id: sub.telegram_user_id,
                  text: message,
                });
              }
              return res;
            }),
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value?.ok) sent++;
            else failed++;
          }
        }


        return new Response(
          JSON.stringify({ ok: true, sent, failed, total: activeSubs.length }),
          { headers: corsHeaders },
        );
      }

      // ── GET CHANNELS ──
      case "get_channels": {
        const { data: channels } = await sb.from("telegram_channels")
          .select("*")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .order("created_at", { ascending: false }).neq("channel_type", "public");

        return new Response(
          JSON.stringify({ ok: true, channels: channels || [] }),
          { headers: corsHeaders },
        );
      }

      // ── DELETE CHANNEL ──
      case "delete_channel": {
        const { channel_id } = params;
        // Delete subscriber_channels first
        await sb.from("subscriber_channels").delete().eq(
          "channel_id",
          channel_id,
        );
        const { error } = await sb.from("telegram_channels").delete().eq(
          "id",
          channel_id,
        ).eq("owner_id", user.id);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders,
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: corsHeaders,
        });
      }

      // ── GET SUBSCRIBER CHANNELS ──
      case "get_subscriber_channels": {
        const { data: subChannels } = await sb.from("subscriber_channels")
          .select(
            "subscriber_id, channel_id, telegram_channels(id, channel_name)",
          )
          .eq("telegram_channels.owner_id", user.id);

        // Group by subscriber
        const grouped: Record<string, any[]> = {};
        for (const sc of (subChannels || [])) {
          if (!grouped[sc.subscriber_id]) grouped[sc.subscriber_id] = [];
          if (sc.telegram_channels) {
            grouped[sc.subscriber_id].push(sc.telegram_channels);
          }
        }

        return new Response(
          JSON.stringify({ ok: true, subscriber_channels: grouped }),
          { headers: corsHeaders },
        );
      }

      // ── UPDATE SUBSCRIBER CHANNELS ──
      case "update_subscriber_channels": {
        const { subscriber_id, channel_ids: newChannelIds } = params;
        await sb.from("subscriber_channels").delete().eq(
          "subscriber_id",
          subscriber_id,
        );
        if (newChannelIds && newChannelIds.length > 0) {
          const rows = newChannelIds.map((chId: string) => ({
            subscriber_id,
            channel_id: chId,
          }));
          await sb.from("subscriber_channels").insert(rows);
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: corsHeaders,
        });
      }

      // ── BROADCAST TO ALL BOT USERS ──
      case "broadcast_all": {
        const { message } = params;
        if (!message?.trim()) {
          return new Response(JSON.stringify({ error: "Message required" }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const [{ data: botUsers }, { data: bannedAllRows }] = await Promise.all([
          sb.from("bot_users")
            .select("telegram_user_id")
            .eq("owner_id", user.id)
            .eq("bot_token_id", botTokenId),
          sb.from("bot_banned_users")
            .select("telegram_user_id")
            .eq("owner_id", user.id)
            .eq("bot_token_id", botTokenId),
        ]);

        const bannedAllSet = new Set(
          (bannedAllRows || []).map((b: any) => Number(b.telegram_user_id)),
        );
        const users = (botUsers || []).filter((u: any) =>
          !bannedAllSet.has(Number(u.telegram_user_id))
        );
        let sent = 0, failed = 0;
        const CONCURRENCY = 10;
        for (let i = 0; i < users.length; i += CONCURRENCY) {
          const batch = users.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(batch.map(async (u: any) => {
            let res = await tg(botToken, "sendMessage", {
              chat_id: u.telegram_user_id,
              text: message,
              parse_mode: "Markdown",
            });
            // Retry without Markdown if parsing failed (e.g. unescaped _ * [ in URLs)
            if (!res.ok && /can't parse|parse entities/i.test(res.description || "")) {
              res = await tg(botToken, "sendMessage", {
                chat_id: u.telegram_user_id,
                text: message,
              });
            }
            return res.ok;
          }));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) sent++;
            else failed++;
          }
        }


        return new Response(
          JSON.stringify({ ok: true, sent, failed, total: users.length }),
          { headers: corsHeaders },
        );
      }

      // ── KICK FROM ALL CHANNELS ──
      case "kick_from_channels": {
        const { subscriber_id } = params;
        if (!subscriber_id) {
          return new Response(
            JSON.stringify({ error: "subscriber_id required" }),
            { status: 400, headers: corsHeaders },
          );
        }

        const { data: sub } = await sb.from("telegram_subscribers").select(
          "id, telegram_user_id, telegram_username, first_name, bot_token_id",
        ).eq("id", subscriber_id).eq("owner_id", user.id).single();
        if (!sub) {
          return new Response(
            JSON.stringify({ error: "Subscriber not found" }),
            { status: 404, headers: corsHeaders },
          );
        }

        // Always kick from ALL owner channels/groups for this bot
        const { data: allChannels } = await sb.from("telegram_channels")
          .select("channel_id, channel_name")
          .eq("owner_id", user.id)
          .eq("bot_token_id", sub.bot_token_id || botData.id).neq("channel_type", "public");

        const channelsList = (allChannels || []).filter((c: any) => c.channel_id);

        let kicked = 0, failedKick = 0;
        const channelResults: { channel_id: number; channel_name: string; success: boolean }[] = [];

        for (const ch of channelsList) {
          try {
            const banRes = await tg(botToken, "banChatMember", {
              chat_id: ch.channel_id,
              user_id: sub.telegram_user_id,
            });
            if (banRes.ok) {
              kicked++;
              // Wait before unban like original code
              await new Promise(r => setTimeout(r, 100));
              await tg(botToken, "unbanChatMember", {
                chat_id: ch.channel_id,
                user_id: sub.telegram_user_id,
                only_if_banned: true,
              });
              channelResults.push({ channel_id: ch.channel_id, channel_name: ch.channel_name, success: true });
            } else {
              failedKick++;
              channelResults.push({ channel_id: ch.channel_id, channel_name: ch.channel_name, success: false });
            }
          } catch (e: any) {
            failedKick++;
            channelResults.push({ channel_id: ch.channel_id, channel_name: ch.channel_name, success: false });
          }
        }

        // Send notification to the kicked user
        try {
          await tg(botToken, "sendMessage", {
            chat_id: sub.telegram_user_id,
            text: `⚠️ تم إلغاء اشتراكك وإزالتك من جميع القنوات.\n\n🆔 رقم حسابك: <code>${sub.telegram_user_id}</code>\n📞 للتجديد تواصل مع المسؤول`,
            parse_mode: "HTML",
          });
        } catch {}

        // Delete subscriber record and their channel assignments
        await sb.from("subscriber_channels").delete().eq("subscriber_id", sub.id);
        await sb.from("telegram_subscribers").delete().eq("id", sub.id).eq("owner_id", user.id);

        return new Response(
          JSON.stringify({ ok: true, kicked, failed: failedKick, channel_results: channelResults }),
          { headers: corsHeaders },
        );
      }

      // ── GET BOT USERS COUNT ──
      case "get_bot_users": {
        const { data: botUsers } = await sb.from("bot_users")
          .select(
            "id, telegram_user_id, telegram_username, first_name, last_name, created_at",
          )
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .order("created_at", { ascending: false });

        return new Response(
          JSON.stringify({
            ok: true,
            bot_users: botUsers || [],
            count: (botUsers || []).length,
          }),
          { headers: corsHeaders },
        );
      }

      // ── GET PUBLIC CHANNEL MEMBERS COUNT ──
      case "get_public_members_count": {
        const { count } = await sb.from("public_channel_members")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        return new Response(JSON.stringify({ ok: true, count: count || 0 }), {
          headers: corsHeaders,
        });
      }

      // ── KICK ALL EXPIRED SUBSCRIBERS FROM ALL CHANNELS ──
      case "kick_expired_from_channels": {
        async function fetchAllExpiredSubscribers() {
          const allRows: any[] = [];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data } = await sb.from("telegram_subscribers")
              .select("id, telegram_user_id, first_name, last_name, telegram_username, expires_at")
              .eq("owner_id", user.id)
              .eq("bot_token_id", botTokenId)
              .eq("is_permanent", false)
              .not("expires_at", "is", null)
              .range(from, from + PAGE - 1);
            if (!data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }
          return allRows;
        }

        const expiredSubs = await fetchAllExpiredSubscribers();
        const nowDate = new Date();
        const expired = expiredSubs.filter((s: any) =>
          s.expires_at && new Date(s.expires_at) < nowDate
        );

        if (expired.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, kicked: 0, failed: 0, total: 0 }),
            { headers: corsHeaders },
          );
        }

        // Get all channels for this owner/bot
        const { data: allChs } = await sb.from("telegram_channels")
          .select("channel_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId).neq("channel_type", "public");

        const chIds = (allChs || []).map((c: any) => c.channel_id).filter(
          Boolean,
        );
        if (chIds.length === 0) {
          return new Response(
            JSON.stringify({
              ok: true,
              kicked: 0,
              failed: 0,
              total: expired.length,
              message: "No channels",
            }),
            { headers: corsHeaders },
          );
        }

        let kicked = 0, failedKick = 0;
        const expiredKickedNames: string[] = [];
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        for (const sub of expired) {
          let userKicked = false;
          for (const chId of chIds) {
            try {
              const banRes = await tg(botToken, "banChatMember", {
                chat_id: chId,
                user_id: sub.telegram_user_id,
              });
              if (banRes.ok) {
                kicked++;
                userKicked = true;
                await tg(botToken, "unbanChatMember", {
                  chat_id: chId,
                  user_id: sub.telegram_user_id,
                  only_if_banned: true,
                });
              } else {
                failedKick++;
              }
            } catch {
              failedKick++;
            }
            await sleep(300);
          }
          if (userKicked) {
            const name = [sub.first_name, sub.last_name].filter(Boolean).join(" ") || sub.telegram_username || String(sub.telegram_user_id);
            expiredKickedNames.push(`${name} (${sub.telegram_user_id})`);
          }
          await sleep(500);
        }

        // Notify admin about expired kicked users
        const adminTgIdExp = botData.admin_telegram_id;
        if (adminTgIdExp && expiredKickedNames.length > 0) {
          const namesList = expiredKickedNames.map((n, i) => `${i + 1}. ${n}`).join("\n");
          const msg = `⏰ *تقرير انتهاء الاشتراكات*\n\n` +
            `تم طرد *${expiredKickedNames.length}* مشترك منتهي:\n\n${namesList}`;
          if (msg.length < 4000) {
            await tg(botToken, "sendMessage", { chat_id: adminTgIdExp, text: msg, parse_mode: "Markdown" }).catch(() => {});
          } else {
            await tg(botToken, "sendMessage", { chat_id: adminTgIdExp, text: `⏰ *تقرير انتهاء الاشتراكات*\n\nتم طرد *${expiredKickedNames.length}* مشترك منتهي من القنوات.`, parse_mode: "Markdown" }).catch(() => {});
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            kicked,
            failed: failedKick,
            total: expired.length,
          }),
          { headers: corsHeaders },
        );
      }

      // ── UNBAN ALL FROM ALL CHANNELS ──
      case "unban_all_from_channels": {
        // Get all channels for this owner/bot
        const { data: allChsUnban } = await sb.from("telegram_channels")
          .select("channel_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId).neq("channel_type", "public");

        const chIdsUnban = (allChsUnban || []).map((c: any) => c.channel_id)
          .filter(Boolean);
        if (chIdsUnban.length === 0) {
          return new Response(
            JSON.stringify({
              ok: true,
              unbanned: 0,
              failed: 0,
              message: "No channels",
            }),
            { headers: corsHeaders },
          );
        }

        // Collect all known user IDs: subscribers + bot_users + public_channel_members
        const [subsU, buU, pcmU] = await Promise.all([
          sb.from("telegram_subscribers").select("telegram_user_id").eq(
            "owner_id",
            user.id,
          ).eq("bot_token_id", botTokenId),
          sb.from("bot_users").select("telegram_user_id").eq(
            "owner_id",
            user.id,
          ).eq("bot_token_id", botTokenId),
          sb.from("public_channel_members").select("telegram_user_id").eq(
            "owner_id",
            user.id,
          ).eq("bot_token_id", botTokenId),
        ]);

        const allUserIds = new Set<number>();
        for (const s of (subsU.data || [])) allUserIds.add(s.telegram_user_id);
        for (const b of (buU.data || [])) allUserIds.add(b.telegram_user_id);
        for (const p of (pcmU.data || [])) allUserIds.add(p.telegram_user_id);

        if (allUserIds.size === 0) {
          return new Response(
            JSON.stringify({ ok: true, unbanned: 0, failed: 0, total: 0 }),
            { headers: corsHeaders },
          );
        }

        let unbanned = 0, failedUnban = 0;
        const BATCH_SIZE = 5;
        const userArr = [...allUserIds];
        for (let i = 0; i < userArr.length; i += BATCH_SIZE) {
          const batch = userArr.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(batch.map(async (uid) => {
            for (const chId of chIdsUnban) {
              try {
                const res = await tg(botToken, "unbanChatMember", {
                  chat_id: chId,
                  user_id: uid,
                  only_if_banned: true,
                });
                if (res.ok) unbanned++;
                else failedUnban++;
              } catch {
                failedUnban++;
              }
            }
          }));
        }

        return new Response(
          JSON.stringify({
            ok: true,
            unbanned,
            failed: failedUnban,
            total: allUserIds.size,
          }),
          { headers: corsHeaders },
        );
      }

      // ── KICK ALL PUBLIC CHANNEL MEMBERS ──
      case "kick_public_members": {
        // Get the public channel setting
        const publicChId = botData.public_channel_id;
        if (!publicChId) {
          return new Response(
            JSON.stringify({ error: "No public channel configured" }),
            { status: 400, headers: corsHeaders },
          );
        }

        // Get the telegram channel_id
        const { data: pubChannel } = await sb.from("telegram_channels").select(
          "channel_id",
        ).eq("id", publicChId).single();
        if (!pubChannel) {
          return new Response(
            JSON.stringify({ error: "Public channel not found" }),
            { status: 404, headers: corsHeaders },
          );
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
            const banRes = await tg(botToken, "banChatMember", {
              chat_id: pubChannel.channel_id,
              user_id: m.telegram_user_id,
            });
            if (banRes.ok) {
              await tg(botToken, "unbanChatMember", {
                chat_id: pubChannel.channel_id,
                user_id: m.telegram_user_id,
                only_if_banned: true,
              });
              return true;
            }
            return false;
          }));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) kicked++;
            else failed++;
          }
        }

        // Delete all public channel member records after kicking
        await sb.from("public_channel_members")
          .delete()
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId)
          .eq("channel_id", publicChId);

        return new Response(
          JSON.stringify({
            ok: true,
            kicked,
            failed,
            total: allMembers.length,
          }),
          { headers: corsHeaders },
        );
      }

      case "kick_trial_user": {
        const { telegram_user_id } = params;
        if (!telegram_user_id) {
          return new Response(
            JSON.stringify({ error: "Missing telegram_user_id" }),
            { status: 400, headers: corsHeaders },
          );
        }

        // Send notification before kicking
        try {
          await tg(botToken, "sendMessage", {
            chat_id: telegram_user_id,
            text:
              "⛔ *تم إلغاء اشتراكك التجريبي.*\n\nتم إزالتك من جميع القنوات والمجموعات.\nللاشتراك تواصل مع المسؤول.",
            parse_mode: "Markdown",
          });
        } catch {}

        const { data: allChannels } = await sb.from("telegram_channels").select(
          "channel_id",
        ).eq("owner_id", user.id).eq("bot_token_id", botTokenId).neq("channel_type", "public");
        const channelIds = (allChannels || []).map((c: any) => c.channel_id);

        let kicked = 0, failed = 0;
        for (let i = 0; i < channelIds.length; i += 5) {
          const batch = channelIds.slice(i, i + 5);
          const results = await Promise.allSettled(
            batch.map(async (chId: number) => {
              const banRes = await tg(botToken, "banChatMember", {
                chat_id: chId,
                user_id: telegram_user_id,
              });
              if (banRes.ok) {
                await tg(botToken, "unbanChatMember", {
                  chat_id: chId,
                  user_id: telegram_user_id,
                  only_if_banned: true,
                });
                return true;
              }
              return false;
            }),
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) kicked++;
            else failed++;
          }
        }

        const { data: sub } = await sb.from("telegram_subscribers").select("id")
          .eq("owner_id", user.id).eq("bot_token_id", botTokenId).eq(
            "telegram_user_id",
            telegram_user_id,
          ).maybeSingle();
        if (sub) {
          await Promise.all([
            sb.from("subscriber_channels").delete().eq("subscriber_id", sub.id),
            sb.from("telegram_subscribers").delete().eq("id", sub.id),
          ]);
        }

        // Keep free_trial_users record so user cannot re-activate free trial
        return new Response(JSON.stringify({ ok: true, kicked, failed }), {
          headers: corsHeaders,
        });
      }

      // ── CHECK BLOCKED SUBSCRIBERS & KICK ──
      case "check_blocked_subscribers": {
        // Get all active subscribers
        const { data: allSubs } = await sb.from("telegram_subscribers")
          .select(
            "id, telegram_user_id, telegram_username, first_name, last_name",
          )
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const activeSubs2 = allSubs || [];
        if (activeSubs2.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, blocked: 0, kicked: 0, failed: 0 }),
            { headers: corsHeaders },
          );
        }

        // Get all channels
        const { data: allChs2 } = await sb.from("telegram_channels")
          .select("channel_id")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId).neq("channel_type", "public");
        const chIds2 = (allChs2 || []).map((c: any) => c.channel_id).filter(
          Boolean,
        );

        const blockedUsers: any[] = [];
        const BATCH2 = 10;

        // Check each subscriber by trying to send a test action (getChat)
        for (let i = 0; i < activeSubs2.length; i += BATCH2) {
          const batch = activeSubs2.slice(i, i + BATCH2);
          await Promise.allSettled(batch.map(async (sub: any) => {
            try {
              const res = await tg(botToken, "sendChatAction", {
                chat_id: sub.telegram_user_id,
                action: "typing",
              });
              if (!res.ok && res.description?.includes("bot was blocked")) {
                blockedUsers.push(sub);
              }
            } catch {}
          }));
        }

        if (blockedUsers.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, blocked: 0, kicked: 0, failed: 0 }),
            { headers: corsHeaders },
          );
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
          const results = await Promise.allSettled(
            batch.map(async ({ chId, userId }) => {
              const banRes = await tg(botToken, "banChatMember", {
                chat_id: chId,
                user_id: userId,
              });
              if (banRes.ok) {
                tg(botToken, "unbanChatMember", {
                  chat_id: chId,
                  user_id: userId,
                  only_if_banned: true,
                }).catch(() => {});
                return true;
              }
              return false;
            }),
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) kicked2++;
            else failed2++;
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            blocked: blockedUsers.length,
            kicked: kicked2,
            failed: failed2,
            blocked_users: blockedUsers.map((u: any) => ({
              telegram_user_id: u.telegram_user_id,
              name: [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                u.telegram_username || String(u.telegram_user_id),
            })),
          }),
          { headers: corsHeaders },
        );
      }

      // ── KICK NON-SUBSCRIBERS FROM CHANNELS ──
      case "kick_non_subscribers": {
        const { target_channel_id } = params;
        let qNS = sb.from("telegram_channels")
          .select("id, channel_id, channel_name")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId).neq("channel_type", "public");
        if (target_channel_id) qNS = qNS.eq("id", target_channel_id);
        const { data: allChsNS } = await qNS;

        const chListNS = (allChsNS || []).filter((c: any) => c.channel_id);
        if (chListNS.length === 0) {
          return new Response(
            JSON.stringify({
              ok: true,
              kicked: 0,
              failed: 0,
              checked: 0,
              channels_results: [],
              kicked_users: [],
            }),
            { headers: corsHeaders },
          );
        }

        // Get all active subscriber telegram_user_ids
        const { data: allSubsNS } = await sb.from("telegram_subscribers")
          .select("telegram_user_id, is_permanent, expires_at")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);

        const nowNS = new Date();
        const activeUserIds = new Set<number>();
        for (const s of (allSubsNS || [])) {
          if (
            s.is_permanent || (s.expires_at && new Date(s.expires_at) > nowNS)
          ) {
            activeUserIds.add(s.telegram_user_id);
          }
        }

        // Also add active free trial users
        const { data: ftNS } = await sb.from("free_trial_users")
          .select("telegram_user_id, expires_at")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId);
        for (const ft of (ftNS || [])) {
          if (ft.expires_at && new Date(ft.expires_at) > nowNS) {
            activeUserIds.add(ft.telegram_user_id);
          }
        }

        const adminTgId = botData.admin_telegram_id;
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // Helper to fetch ALL rows with pagination (bypass 1000 limit)
        async function fetchAllPaged(
          table: string,
          selectCols: string,
          filters: Record<string, any>,
        ) {
          const allRows: any[] = [];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            let q = sb.from(table).select(selectCols).range(
              from,
              from + PAGE - 1,
            );
            for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
            const { data } = await q;
            if (!data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }
          return allRows;
        }

        // Process channel by channel - check each channel's members
        const channelsResults: any[] = [];
        const allKickedUsers: { telegram_user_id: number; name: string }[] = [];

        for (const ch of chListNS) {
          // Get channel admins to exclude
          const channelAdmins = new Set<number>();
          try {
            const res = await tg(botToken, "getChatAdministrators", { chat_id: ch.channel_id });
            if (res.ok) {
              for (const a of res.result) channelAdmins.add(a.user.id);
            }
          } catch {}

          // Get ALL members of THIS channel from channel_members table (paginated)
          const channelMembers: any[] = [];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data } = await sb.from("channel_members")
              .select("telegram_user_id, first_name, last_name, telegram_username")
              .eq("owner_id", user.id)
              .eq("bot_token_id", botTokenId)
              .eq("channel_id", ch.id)
              .range(from, from + PAGE - 1);
            if (!data || data.length === 0) break;
            channelMembers.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }

          // Filter: kick members NOT in active subscribers, NOT admin, NOT channel admin
          const toKick = channelMembers.filter(m => {
            if (activeUserIds.has(m.telegram_user_id)) return false;
            if (adminTgId && m.telegram_user_id === adminTgId) return false;
            if (channelAdmins.has(m.telegram_user_id)) return false;
            return true;
          });

          let chKicked = 0, chFailed = 0;
          const chKickedUsers: { telegram_user_id: number; name: string }[] = [];

          for (const m of toKick) {
            const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.telegram_username || String(m.telegram_user_id);
            try {
              const banRes = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: m.telegram_user_id });
              console.log(`Ban uid=${m.telegram_user_id} in ch=${ch.channel_id}: ok=${banRes.ok}`);
              if (banRes.ok) {
                chKicked++;
                chKickedUsers.push({ telegram_user_id: m.telegram_user_id, name });
                if (!allKickedUsers.some(u => u.telegram_user_id === m.telegram_user_id)) {
                  allKickedUsers.push({ telegram_user_id: m.telegram_user_id, name });
                }
                tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: m.telegram_user_id, only_if_banned: true }).catch(() => {});
              } else chFailed++;
            } catch { chFailed++; }
            await sleep(200);
          }

          channelsResults.push({
            channel_name: ch.channel_name,
            channel_id: ch.channel_id,
            checked: channelMembers.length,
            kicked: chKicked,
            failed: chFailed,
            kicked_users: chKickedUsers,
          });

          console.log(`Channel ${ch.channel_name}: members=${channelMembers.length}, toKick=${toKick.length}, kicked=${chKicked}`);
        }

        const totalKicked = channelsResults.reduce(
          (s: number, c: any) => s + c.kicked,
          0,
        );
        const totalFailed = channelsResults.reduce(
          (s: number, c: any) => s + c.failed,
          0,
        );
        const totalChecked = channelsResults.reduce((s: number, c: any) => s + c.checked, 0);

        // Notify admin in Telegram with kicked users per channel
        if (adminTgId && allKickedUsers.length > 0) {
          let msg = `🔍 *تقرير طرد غير المشتركين*\n\n`;
          for (const cr of channelsResults) {
            if (cr.kicked_users.length === 0) continue;
            const icon = cr.channel_name.includes("👥") ? "👥" : "📺";
            msg += `${icon} *${cr.channel_name}* — طُرد ${cr.kicked_users.length}:\n`;
            for (const u of cr.kicked_users) {
              msg += `  • ${u.name} (\`${u.telegram_user_id}\`)\n`;
            }
            msg += `\n`;
          }
          msg += `✅ *المجموع: ${allKickedUsers.length}* مستخدم غير مشترك`;
          if (msg.length < 4000) {
            await tg(botToken, "sendMessage", { chat_id: adminTgId, text: msg, parse_mode: "Markdown" }).catch(() => {});
          } else {
            // Send summary per channel without names
            let shortMsg = `🔍 *تقرير طرد غير المشتركين*\n\n`;
            for (const cr of channelsResults) {
              if (cr.kicked > 0) shortMsg += `📺 *${cr.channel_name}*: ${cr.kicked} مطرود\n`;
            }
            shortMsg += `\n✅ *المجموع: ${allKickedUsers.length}* مستخدم`;
            await tg(botToken, "sendMessage", { chat_id: adminTgId, text: shortMsg, parse_mode: "Markdown" }).catch(() => {});
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            kicked: totalKicked,
            failed: totalFailed,
            checked: totalChecked,
            channels_results: channelsResults,
            kicked_users: allKickedUsers,
          }),
          { headers: corsHeaders },
        );
      }

      // ── KICK ALL MEMBERS FROM CHANNELS (EXCEPT ADMINS) ──
      case "kick_all_members": {
        const { target_channel_id: targetChKA } = params;
        let qKA = sb.from("telegram_channels")
          .select("id, channel_id, channel_name")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId).neq("channel_type", "public");
        if (targetChKA) qKA = qKA.eq("id", targetChKA);
        const { data: allChsKA } = await qKA;

        const chListKA = (allChsKA || []).filter((c: any) => c.channel_id);
        if (chListKA.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, kicked: 0, failed: 0, channels_results: [], kicked_users: [] }),
            { headers: corsHeaders },
          );
        }

        const sleepKA = (ms: number) => new Promise((r) => setTimeout(r, ms));

        async function fetchAllPagedKA(table: string, selectCols: string, filters: Record<string, any>) {
          const allRows: any[] = [];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            let q = sb.from(table).select(selectCols).range(from, from + PAGE - 1);
            for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
            const { data } = await q;
            if (!data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }
          return allRows;
        }

        // Gather ALL known users from every table
        const [allSubsKA, allBotUsersKA, publicMembersKA, trackedChannelMembersKA] = await Promise.all([
          fetchAllPagedKA("telegram_subscribers", "id, telegram_user_id, first_name, last_name, telegram_username", { owner_id: user.id, bot_token_id: botTokenId }),
          fetchAllPagedKA("bot_users", "telegram_user_id, first_name, last_name, telegram_username", { owner_id: user.id, bot_token_id: botTokenId }),
          fetchAllPagedKA("public_channel_members", "telegram_user_id, first_name, last_name, telegram_username", { owner_id: user.id, bot_token_id: botTokenId }),
          fetchAllPagedKA("channel_members", "telegram_user_id, first_name, last_name, telegram_username", { owner_id: user.id, bot_token_id: botTokenId }),
        ]);

        // Build a global map of ALL known user IDs with names
        const globalUserMap = new Map<number, string>();
        for (const u of allSubsKA) {
          globalUserMap.set(u.telegram_user_id,
            [u.first_name, u.last_name].filter(Boolean).join(" ") || u.telegram_username || String(u.telegram_user_id));
        }
        for (const u of allBotUsersKA) {
          if (!globalUserMap.has(u.telegram_user_id)) {
            globalUserMap.set(u.telegram_user_id,
              [u.first_name, u.last_name].filter(Boolean).join(" ") || u.telegram_username || String(u.telegram_user_id));
          }
        }
        for (const u of publicMembersKA) {
          if (!globalUserMap.has(u.telegram_user_id)) {
            globalUserMap.set(u.telegram_user_id,
              [u.first_name, u.last_name].filter(Boolean).join(" ") || u.telegram_username || String(u.telegram_user_id));
          }
        }
        for (const u of trackedChannelMembersKA) {
          if (!globalUserMap.has(u.telegram_user_id)) {
            globalUserMap.set(u.telegram_user_id,
              [u.first_name, u.last_name].filter(Boolean).join(" ") || u.telegram_username || String(u.telegram_user_id));
          }
        }

        console.log(`Total unique known users: ${globalUserMap.size}`);

        const channelsResultsKA: any[] = [];
        const allKickedUsersKA: { telegram_user_id: number; name: string }[] = [];

        for (const ch of chListKA) {
          // Get admins for THIS channel
          const adminIds = new Set<number>();
          try {
            const res = await tg(botToken, "getChatAdministrators", { chat_id: ch.channel_id });
            if (res.ok) { for (const a of res.result) adminIds.add(a.user.id); }
          } catch {}

          console.log(`Channel ${ch.channel_name}: ${adminIds.size} admins, trying to kick ${globalUserMap.size} users`);

          // Try to kick ALL known users (except admins) from this channel
          const toKick = [...globalUserMap.entries()]
            .filter(([uid]) => !adminIds.has(uid))
            .map(([telegram_user_id, name]) => ({ telegram_user_id, name }));

          let chKicked = 0, chFailed = 0;
          const chKickedUsers: { telegram_user_id: number; name: string }[] = [];

          // Process in batches of 10 for speed
          const BATCH = 10;
          for (let i = 0; i < toKick.length; i += BATCH) {
            const batch = toKick.slice(i, i + BATCH);
            const results = await Promise.allSettled(batch.map(async (member) => {
              const banRes = await tg(botToken, "banChatMember", {
                chat_id: ch.channel_id,
                user_id: member.telegram_user_id,
              });
              if (banRes.ok) {
                tg(botToken, "unbanChatMember", {
                  chat_id: ch.channel_id,
                  user_id: member.telegram_user_id,
                  only_if_banned: true,
                }).catch(() => {});
                return { success: true, member };
              }
              return { success: false, member };
            }));
            for (const r of results) {
              if (r.status === "fulfilled" && r.value.success) {
                chKicked++;
                chKickedUsers.push(r.value.member);
                if (!allKickedUsersKA.some((u) => u.telegram_user_id === r.value.member.telegram_user_id)) {
                  allKickedUsersKA.push(r.value.member);
                }
              } else {
                chFailed++;
              }
            }
            await sleepKA(200);
          }

          // Clean up DB records for kicked users
          if (chKickedUsers.length > 0) {
            const kickedIds = chKickedUsers.map((u) => u.telegram_user_id);
            await Promise.all([
              sb.from("channel_members").delete().eq("owner_id", user.id).eq("bot_token_id", botTokenId).eq("channel_id", ch.id).in("telegram_user_id", kickedIds),
              sb.from("public_channel_members").delete().eq("owner_id", user.id).eq("bot_token_id", botTokenId).eq("channel_id", ch.id).in("telegram_user_id", kickedIds),
            ]);
          }

          channelsResultsKA.push({
            channel_name: ch.channel_name,
            channel_id: ch.channel_id,
            checked: toKick.length,
            kicked: chKicked,
            failed: chFailed,
            kicked_users: chKickedUsers,
          });
        }

        const totalKickedKA = channelsResultsKA.reduce((s: number, c: any) => s + c.kicked, 0);
        const totalFailedKA = channelsResultsKA.reduce((s: number, c: any) => s + c.failed, 0);

        return new Response(
          JSON.stringify({
            ok: true,
            kicked: totalKickedKA,
            failed: totalFailedKA,
            channels_results: channelsResultsKA,
            kicked_users: allKickedUsersKA,
          }),
          { headers: corsHeaders },
        );
      }

      // ── BROADCAST TO ALL CHANNELS ──
      case "broadcast_channels": {
        const { message } = params;
        if (!message?.trim()) {
          return new Response(JSON.stringify({ error: "Message required" }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const { data: allChs } = await sb.from("telegram_channels")
          .select("channel_id, channel_name")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId).neq("channel_type", "public");

        const chList = allChs || [];
        if (chList.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, sent: 0, failed: 0, total: 0 }),
            { headers: corsHeaders },
          );
        }

        let sent = 0, failed = 0;
        for (const ch of chList) {
          try {
            const res = await tg(botToken, "sendMessage", {
              chat_id: ch.channel_id,
              text: message,
              parse_mode: "Markdown",
            });
            if (res.ok) sent++;
            else {
              console.log(
                `Failed to send to channel ${ch.channel_id}:`,
                JSON.stringify(res),
              );
              failed++;
            }
          } catch {
            failed++;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, sent, failed, total: chList.length }),
          { headers: corsHeaders },
        );
      }

      // ── CHECK BOT ADMIN STATUS ──
      case "set_public_channel": {
        const raw = String(params.chat_id ?? "").trim();
        const json = (b: any, status = 200) => new Response(JSON.stringify(b), { status, headers: corsHeaders });
        if (!raw) {
          await sb.from("bot_tokens").update({ public_channel_id: null }).eq("id", botTokenId);
          return json({ ok: true, cleared: true });
        }
        if (!/^-?\d+$/.test(raw)) return json({ error: "invalid_id" }, 400);
        const chatId = Number(raw);
        const chat = await tg(botToken, "getChat", { chat_id: chatId });
        if (!chat.ok) return json({ error: "not_found", details: chat.description }, 400);
        const me = await tg(botToken, "getMe", {});
        const member = await tg(botToken, "getChatMember", { chat_id: chatId, user_id: me.result?.id });
        if (!member.ok || member.result?.status !== "administrator") return json({ error: "not_admin", title: chat.result.title }, 400);
        let invite = chat.result.invite_link || (chat.result.username ? `https://t.me/${chat.result.username}` : null);
        if (!invite) {
          const inv = await tg(botToken, "exportChatInviteLink", { chat_id: chatId });
          if (inv.ok) invite = inv.result;
        }
        const title = chat.result.title || String(chatId);
        const { data: existing } = await sb.from("telegram_channels").select("id")
          .eq("owner_id", user.id).eq("bot_token_id", botTokenId).eq("channel_id", chatId).maybeSingle();
        let rowId = existing?.id;
        if (rowId) {
          await sb.from("telegram_channels").update({ channel_name: title, invite_link: invite, channel_type: "public" }).eq("id", rowId);
        } else {
          const { data: ins, error } = await sb.from("telegram_channels").insert({
            owner_id: user.id, bot_token_id: botTokenId, channel_id: chatId, channel_name: title, invite_link: invite, channel_type: "public",
          }).select("id").single();
          if (error) return json({ error: error.message }, 400);
          rowId = ins.id;
        }
        await sb.from("bot_tokens").update({ public_channel_id: rowId }).eq("id", botTokenId);
        return json({ ok: true, id: rowId, title, chat_type: chat.result.type, invite_link: invite });
      }

      case "check_bot_admin": {
        const { data: chList } = await sb
          .from("telegram_channels")
          .select("id, channel_id, channel_name, channel_type")
          .eq("owner_id", user.id)
          .eq("bot_token_id", botTokenId).neq("channel_type", "public");

        if (!chList || chList.length === 0) {
          return new Response(
            JSON.stringify({ channels: [] }),
            { headers: corsHeaders },
          );
        }

        const results: { channel_name: string; channel_id: number; channel_type: string; is_admin: boolean; bot_permissions: string[] }[] = [];

        for (const ch of chList) {
          try {
            const res = await tg(botToken, "getChatAdministrators", {
              chat_id: ch.channel_id,
            });
            if (res.ok) {
              const botMe = await tg(botToken, "getMe", {});
              const botId = botMe.result?.id;
              const botAdmin = res.result.find((a: any) => a.user.id === botId);
              if (botAdmin) {
                const perms: string[] = [];
                if (botAdmin.can_restrict_members) perms.push("restrict_members");
                if (botAdmin.can_delete_messages) perms.push("delete_messages");
                if (botAdmin.can_invite_users) perms.push("invite_users");
                if (botAdmin.can_manage_chat) perms.push("manage_chat");
                results.push({
                  channel_name: ch.channel_name,
                  channel_id: ch.channel_id,
                  channel_type: ch.channel_type,
                  is_admin: true,
                  bot_permissions: perms,
                });
              } else {
                results.push({
                  channel_name: ch.channel_name,
                  channel_id: ch.channel_id,
                  channel_type: ch.channel_type,
                  is_admin: false,
                  bot_permissions: [],
                });
              }
            } else {
              results.push({
                channel_name: ch.channel_name,
                channel_id: ch.channel_id,
                channel_type: ch.channel_type,
                is_admin: false,
                bot_permissions: [],
              });
            }
          } catch {
            results.push({
              channel_name: ch.channel_name,
              channel_id: ch.channel_id,
              channel_type: ch.channel_type,
              is_admin: false,
              bot_permissions: [],
            });
          }
        }

        return new Response(
          JSON.stringify({ channels: results }),
          { headers: corsHeaders },
        );
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: corsHeaders,
        });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
