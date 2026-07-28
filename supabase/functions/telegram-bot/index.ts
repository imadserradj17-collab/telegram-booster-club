import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { t, langPickerKeyboard, type Lang } from "./i18n.ts";

async function getUserLang(
  ownerId: string,
  telegramUserId: number,
): Promise<Lang> {
  const { data } = await sb.from("bot_users").select("language").eq(
    "owner_id",
    ownerId,
  ).eq("telegram_user_id", telegramUserId).maybeSingle();
  return (data?.language === "en" ? "en" : "ar") as Lang;
}

async function setUserLang(
  ownerId: string,
  telegramUserId: number,
  lang: Lang,
) {
  await sb.from("bot_users").update({ language: lang }).eq("owner_id", ownerId)
    .eq("telegram_user_id", telegramUserId);
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Single cached client instance
const sb = createClient(supabaseUrl, supabaseServiceKey);

// Log an admin/moderator action performed via the bot
async function logBotActivity(opts: {
  botTokenId: string;
  ownerId: string;
  actorTelegramId: number;
  isModerator: boolean;
  actorName?: string | null;
  actorUsername?: string | null;
  action: string;
  targetLabel?: string | null;
  targetTelegramId?: number | null;
  details?: Record<string, any>;
}) {
  try {
    await sb.from("bot_admin_activity_log").insert({
      bot_token_id: opts.botTokenId,
      owner_id: opts.ownerId,
      actor_telegram_id: opts.actorTelegramId,
      actor_role: opts.isModerator ? "moderator" : "owner",
      actor_name: opts.actorName ?? null,
      actor_username: opts.actorUsername ?? null,
      action: opts.action,
      target_label: opts.targetLabel ?? null,
      target_telegram_id: opts.targetTelegramId ?? null,
      details: opts.details ?? {},
    });
  } catch (_e) { /* ignore logging failure */ }
}


async function getBotSettingsByToken(token: string) {
  const { data } = await sb
    .from("bot_tokens")
    .select(
      "id, user_id, admin_telegram_id, non_subscriber_message, public_channel_id, subscribers_channel_id, free_trial_enabled, free_trial_days, mandatory_channel_id, mandatory_chat_id, free_trial_channel_ids",
    )
    .eq("token", token)
    .maybeSingle();
  return data || null;
}

async function tg(token: string, method: string, body?: any) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Fire-and-forget telegram call (don't await response)
function tgFire(token: string, method: string, body?: any) {
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {});
}

async function getUserPhotoUrl(
  token: string,
  userId: number,
): Promise<string | null> {
  try {
    const photos = await tg(token, "getUserProfilePhotos", {
      user_id: userId,
      limit: 1,
    });
    if (!photos.ok || !photos.result?.photos?.length) return null;
    const fileId =
      photos.result.photos[0][photos.result.photos[0].length - 1].file_id;
    const file = await tg(token, "getFile", { file_id: fileId });
    if (!file.ok) return null;
    return `https://api.telegram.org/file/bot${token}/${file.result.file_path}`;
  } catch {
    return null;
  }
}

// Try all methods to get user info (name, username, photo)
async function enrichUserInfo(
  token: string,
  userId: number,
  existing: { fn: string | null; ln: string | null; username: string | null },
) {
  let { fn, ln, username } = existing;
  let photoUrl: string | null = null;

  // Method 1: getChat - gets first_name, last_name, username, photo
  try {
    const chatInfo = await tg(token, "getChat", { chat_id: userId });
    if (chatInfo.ok && chatInfo.result) {
      const r = chatInfo.result;
      if (!fn && r.first_name) fn = r.first_name;
      if (!ln && r.last_name) ln = r.last_name;
      if (!username && r.username) username = r.username;
      // getChat returns photo.big_file_id for high-res photo
      if (r.photo?.big_file_id) {
        try {
          const file = await tg(token, "getFile", {
            file_id: r.photo.big_file_id,
          });
          if (file.ok) {
            photoUrl =
              `https://api.telegram.org/file/bot${token}/${file.result.file_path}`;
          }
        } catch {}
      }
    }
  } catch {}

  // Method 2: getUserProfilePhotos - fallback if getChat didn't return photo
  if (!photoUrl) {
    photoUrl = await getUserPhotoUrl(token, userId);
  }

  return { fn, ln, username, photoUrl };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysRemaining(expiresAt: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000),
  );
}

// ─── STATE MANAGEMENT ───
async function setState(
  chatId: number,
  botTokenId: string,
  state: string,
  data?: any,
) {
  await sb.from("bot_pending_states").upsert(
    { chat_id: chatId, bot_token_id: botTokenId, state, data: data || {} },
    { onConflict: "chat_id,bot_token_id" },
  );
}

async function getState(chatId: number, botTokenId: string) {
  const { data } = await sb.from("bot_pending_states")
    .select("state, data")
    .eq("chat_id", chatId)
    .eq("bot_token_id", botTokenId)
    .maybeSingle();
  return data ? { state: data.state, data: data.data } : null;
}

async function clearState(chatId: number, botTokenId: string) {
  await sb.from("bot_pending_states")
    .delete()
    .eq("chat_id", chatId)
    .eq("bot_token_id", botTokenId);
}

// Threshold: subscribers assigned to more than this many channels
// are auto-promoted to "all channels" access (Full Access).
const FULL_ACCESS_THRESHOLD = 5;

// Cache of all channel IDs per bot_token (used for >5 promotion)
async function getAllChannelIdsForBot(botTokenId: string): Promise<string[]> {
  const { data } = await sb.from("telegram_channels")
    .select("id")
    .eq("bot_token_id", botTokenId);
  return (data || []).map((r: any) => r.id);
}

// Batch get subscriber channels for multiple subscribers
async function getSubscriberChannelsBatch(
  subscriberIds: string[],
  botTokenId?: string,
): Promise<Record<string, string[]>> {
  if (subscriberIds.length === 0) return {};
  const { data } = await sb.from("subscriber_channels")
    .select("subscriber_id, channel_id")
    .in("subscriber_id", subscriberIds);
  const map: Record<string, string[]> = {};
  for (const r of (data || [])) {
    if (!map[r.subscriber_id]) map[r.subscriber_id] = [];
    map[r.subscriber_id].push(r.channel_id);
  }
  // Auto-promote: anyone with > FULL_ACCESS_THRESHOLD assigned channels
  // is treated as having access to ALL channels of the bot.
  if (botTokenId) {
    let allIds: string[] | null = null;
    for (const subId of Object.keys(map)) {
      if (map[subId].length > FULL_ACCESS_THRESHOLD) {
        if (allIds === null) allIds = await getAllChannelIdsForBot(botTokenId);
        map[subId] = [...allIds];
      }
    }
  }
  return map;
}

async function getSubscriberChannels(
  subscriberId: string,
  botTokenId?: string,
): Promise<string[]> {
  const { data } = await sb.from("subscriber_channels")
    .select("channel_id")
    .eq("subscriber_id", subscriberId);
  const ids = (data || []).map((r: any) => r.channel_id);
  // Auto-promote to all channels when over threshold
  if (botTokenId && ids.length > FULL_ACCESS_THRESHOLD) {
    return await getAllChannelIdsForBot(botTokenId);
  }
  return ids;
}

// Check if subscriber has ALL channels (no specific assignments) — mandatory channel only applies to these
async function subscriberHasAllChannels(
  subscriberId: string,
): Promise<boolean> {
  const { data } = await sb.from("subscriber_channels")
    .select("channel_id")
    .eq("subscriber_id", subscriberId);
  const count = (data || []).length;
  // No specific assignments OR over threshold = full access to all channels
  return count === 0 || count > FULL_ACCESS_THRESHOLD;
}

function adminKeyboard(restricted: boolean = false) {
  if (restricted) {
    return {
      inline_keyboard: [
        [
          { text: "➕ إضافة مشترك", callback_data: "add_subscriber" },
          { text: "📋 المشتركين", callback_data: "list_subscribers" },
        ],
        [
          { text: "🔍 بحث عن مشترك", callback_data: "search_subscriber" },
          { text: "🗑 حذف مشترك", callback_data: "delete_subscriber" },
        ],
      ],
    };
  }
  return {
    inline_keyboard: [
      [
        { text: "➕ إضافة مشترك", callback_data: "add_subscriber" },
        { text: "📋 المشتركين", callback_data: "list_subscribers" },
      ],
      [
        { text: "➕ إضافة قناة/مجموعة", callback_data: "add_channel" },
        { text: "📺 القنوات والمجموعات", callback_data: "manage_channels" },
      ],
      [
        { text: "📢 رسالة جماعية", callback_data: "broadcast" },
        { text: "📊 إحصائيات", callback_data: "stats" },
      ],
      [
        { text: "🔍 بحث عن مشترك", callback_data: "search_subscriber" },
        { text: "🗑 حذف مشترك", callback_data: "delete_subscriber" },
      ],
    ],
  };
}

// Get moderator telegram_user_id set for a given bot
async function getModeratorIds(botTokenId: string): Promise<Set<number>> {
  const { data } = await sb.from("bot_moderators").select("telegram_user_id").eq(
    "bot_token_id",
    botTokenId,
  );
  return new Set((data || []).map((r: any) => Number(r.telegram_user_id)));
}

// Concurrent broadcast with controlled concurrency
async function broadcastConcurrent(
  botToken: string,
  subs: any[],
  msg: any,
  chatId: number,
  text: string,
) {
  const CONCURRENCY = 10;
  let sent = 0, failed = 0;

  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    const batch = subs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async (sub: any) => {
      if (msg.photo || msg.video || msg.document || msg.animation) {
        return tg(botToken, "copyMessage", {
          chat_id: sub.telegram_user_id,
          from_chat_id: chatId,
          message_id: msg.message_id,
        });
      } else if (msg.forward_from_chat || msg.forward_from) {
        return tg(botToken, "forwardMessage", {
          chat_id: sub.telegram_user_id,
          from_chat_id: chatId,
          message_id: msg.message_id,
        });
      } else {
        return tg(botToken, "sendMessage", {
          chat_id: sub.telegram_user_id,
          text,
        });
      }
    }));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.ok) sent++;
      else failed++;
    }
  }
  return { sent, failed };
}

// Parallel kick from channels
async function kickFromChannels(
  botToken: string,
  userId: number,
  channelIds: number[],
) {
  const results = await Promise.allSettled(channelIds.map(async (chId) => {
    const res = await tg(botToken, "banChatMember", {
      chat_id: chId,
      user_id: userId,
    });
    if (res.ok) {
      await tg(botToken, "unbanChatMember", {
        chat_id: chId,
        user_id: userId,
        only_if_banned: true,
      });
    }
    return res.ok;
  }));
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}

// ─── Ban system ───
async function isBanned(botTokenId: string, telegramUserId: number) {
  const { data } = await sb.from("bot_banned_users").select("id")
    .eq("bot_token_id", botTokenId)
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return !!data;
}

// Permanently ban a user from every channel/group of this bot
async function banEverywhere(
  botToken: string,
  ownerId: string,
  botTokenId: string,
  userId: number,
) {
  const { data } = await sb.from("telegram_channels").select("channel_id")
    .eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
  const chIds = (data || []).map((c: any) => c.channel_id);
  const results = await Promise.allSettled(
    chIds.map((chId: number) =>
      tg(botToken, "banChatMember", { chat_id: chId, user_id: userId })
    ),
  );
  return results.filter((r: any) => r.status === "fulfilled" && r.value?.ok)
    .length;
}

async function unbanEverywhere(
  botToken: string,
  ownerId: string,
  botTokenId: string,
  userId: number,
) {
  const { data } = await sb.from("telegram_channels").select("channel_id")
    .eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
  const chIds = (data || []).map((c: any) => c.channel_id);
  const results = await Promise.allSettled(
    chIds.map((chId: number) =>
      tg(botToken, "unbanChatMember", {
        chat_id: chId,
        user_id: userId,
        only_if_banned: true,
      })
    ),
  );
  return results.filter((r: any) => r.status === "fulfilled" && r.value?.ok)
    .length;
}



// Get channels to kick a subscriber from
async function getKickChannels(
  subscriberId: string | null,
  ownerId: string,
  botTokenId: string,
): Promise<number[]> {
  if (subscriberId) {
    const assignedIds = await getSubscriberChannels(subscriberId);
    if (assignedIds.length > 0) {
      const { data } = await sb.from("telegram_channels").select("channel_id")
        .in("id", assignedIds);
      return (data || []).map((c: any) => c.channel_id);
    }
  }
  const { data } = await sb.from("telegram_channels").select("channel_id").eq(
    "owner_id",
    ownerId,
  ).eq("bot_token_id", botTokenId);
  return (data || []).map((c: any) => c.channel_id);
}

async function finalizeSubscriber(
  botToken: string,
  chatId: number,
  ownerId: string,
  botTokenId: string,
  telegramUserId: number,
  telegramUsername: string | null,
  fn: string | null,
  ln: string | null,
  days: number | null,
  isPermanent: boolean,
  selectedChannelIds: string[],
  isModerator: boolean = false,
) {
  // Check existing subscription to add remaining days
  let expiresAt: string | null = null;
  if (!isPermanent && days) {
    const { data: existingSub } = await sb.from("telegram_subscribers")
      .select("expires_at, is_permanent")
      .eq("owner_id", ownerId)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    let baseDate = Date.now();
    // If existing sub has remaining time, start from its expiry date
    if (existingSub && !existingSub.is_permanent && existingSub.expires_at) {
      const existingExpiry = new Date(existingSub.expires_at).getTime();
      if (existingExpiry > baseDate) {
        baseDate = existingExpiry; // Add new days on top of remaining
      }
    }
    expiresAt = new Date(baseDate + days * 86400000).toISOString();
  }

  // Enrich user info (try getChat + getUserProfilePhotos) in parallel with DB upsert
  const enrichPromise = enrichUserInfo(botToken, telegramUserId, {
    fn,
    ln,
    username: telegramUsername,
  });

  const { data: upsertedSub, error } = await sb.from("telegram_subscribers")
    .upsert(
      {
        owner_id: ownerId,
        bot_token_id: botTokenId,
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        first_name: fn || null,
        last_name: ln || null,
        photo_url: null,
        subscription_days: days,
        expires_at: expiresAt,
        is_permanent: isPermanent,
        expiry_notified: false,
      },
      { onConflict: "owner_id,telegram_user_id" },
    ).select("id").single();

  if (error) {
    await tg(botToken, "sendMessage", {
      chat_id: chatId,
      text: "❌ خطأ: " + error.message,
      reply_markup: adminKeyboard(isModerator),
    });
    return;
  }

  const subscriberId = upsertedSub.id;

  // Parallel: enrich info, clear old channels
  const [enriched] = await Promise.all([
    enrichPromise,
    sb.from("subscriber_channels").delete().eq("subscriber_id", subscriberId),
  ]);

  // Update enriched info (name, username, photo)
  const updateData: any = {};
  if (enriched.fn) updateData.first_name = enriched.fn;
  if (enriched.ln) updateData.last_name = enriched.ln;
  if (enriched.username) updateData.telegram_username = enriched.username;
  if (enriched.photoUrl) updateData.photo_url = enriched.photoUrl;
  if (Object.keys(updateData).length > 0) {
    sb.from("telegram_subscribers").update(updateData).eq("id", subscriberId)
      .then(() => {});
  }

  // Insert new channel assignments
  if (selectedChannelIds.length > 0) {
    const rows = selectedChannelIds.map((chId: string) => ({
      subscriber_id: subscriberId,
      channel_id: chId,
    }));
    await sb.from("subscriber_channels").insert(rows);
  }

  // Get channel info and send invite links in parallel
  const { data: selectedChannels } = await sb.from("telegram_channels")
    .select("channel_name, invite_link")
    .in("id", selectedChannelIds);

  const buttons = (selectedChannels || []).filter((ch: any) => ch.invite_link)
    .map((ch: any) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);

  let notifiedSubscriber = false;
  if (buttons.length > 0) {
    try {
      const sendResult = await tg(botToken, "sendMessage", {
        chat_id: telegramUserId,
        text: "🎉 *تم تفعيل اشتراكك!*\n\nاضغط على الأزرار للانضمام:",
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons },
      });
      notifiedSubscriber = sendResult.ok === true;
    } catch {
      notifiedSubscriber = false;
    }
  }

  const subInfo = isPermanent
    ? "♾ دائم"
    : `📅 ${days} يوم (حتى ${formatDate(expiresAt!)})`;
  const notifStatus = buttons.length > 0
    ? (notifiedSubscriber
      ? `\n✉️ تم إرسال ${buttons.length} رابط للمشترك`
      : "\n⚠️ لم يتم إرسال الروابط (المشترك لم يبدأ البوت)")
    : "";
  await tg(botToken, "sendMessage", {
    chat_id: chatId,
    text:
      `✅ *تمت إضافة المشترك بنجاح!*\n\n🆔 المعرف: \`${telegramUserId}\`\n${subInfo}\n📺 القنوات: *${selectedChannelIds.length}*${notifStatus}`,
    parse_mode: "Markdown",
    reply_markup: adminKeyboard(isModerator),
  });

  // Log activity
  logBotActivity({
    botTokenId,
    ownerId,
    actorTelegramId: chatId,
    isModerator,
    action: "subscriber_added",
    targetLabel: telegramUsername ? `@${telegramUsername}` : String(telegramUserId),
    targetTelegramId: telegramUserId,
    details: {
      days,
      is_permanent: isPermanent,
      expires_at: expiresAt,
      channels_count: selectedChannelIds.length,
      subscriber_name: [fn, ln].filter(Boolean).join(" ") || null,
    },
  });
}

// Resolve mandatory chat info via Telegram getChat
async function getMandatoryChatInfo(
  botToken: string,
  chatId: number,
): Promise<{ channel_id: number; channel_name: string; invite_link: string | null; channel_type: string } | null> {
  try {
    const res = await tg(botToken, "getChat", { chat_id: chatId });
    if (!res.ok) return null;
    const c = res.result;
    const type = c.type === "channel" ? "channel" : "group";
    let invite: string | null = c.invite_link ?? null;
    if (!invite && c.username) invite = `https://t.me/${c.username}`;
    return {
      channel_id: chatId,
      channel_name: c.title || c.username || String(chatId),
      invite_link: invite,
      channel_type: type,
    };
  } catch {
    return null;
  }
}

// Check if user is member of mandatory channel (by raw Telegram chat id)
async function checkMandatoryChannel(
  botToken: string,
  mandatoryChatId: number,
  telegramUserId: number,
): Promise<{ isMember: boolean; channelInfo: any | null }> {
  const channelInfo = await getMandatoryChatInfo(botToken, mandatoryChatId);
  try {
    const result = await tg(botToken, "getChatMember", {
      chat_id: mandatoryChatId,
      user_id: telegramUserId,
    });
    if (result.ok) {
      const status = result.result.status;
      const isMember = ["member", "administrator", "creator"].includes(status);
      return { isMember, channelInfo };
    }
  } catch {}
  return { isMember: false, channelInfo };
}

async function handleUpdate(
  update: any,
  botToken: string,
  ownerId: string,
  botTokenId: string,
  adminTelegramId: number | null,
  nonSubMessage: string,
  publicChannelId: string | null = null,
  subscribersChannelId: string | null = null,
  freeTrialEnabled: boolean = false,
  freeTrialDays: number = 3,
  mandatoryChatId: number | null = null,
  freeTrialChannelIds: string[] = [],
) {
  console.log("handleUpdate called, keys:", Object.keys(update).join(","));

  // ─── CHAT MEMBER UPDATES (track joins to public channel + mandatory channel enforcement) ───
  if (update.chat_member) {
    const cm = update.chat_member;
    const newStatus = cm.new_chat_member?.status;
    const oldStatus = cm.old_chat_member?.status;
    const chatId = cm.chat.id;
    const userId = cm.new_chat_member?.user?.id;

    console.log(
      `chat_member update: chatId=${chatId}, userId=${userId}, old=${oldStatus}, new=${newStatus}, mandatoryChatId=${mandatoryChatId}`,
    );

    // Track when someone joins ANY channel
    if (
      userId && (newStatus === "member" || newStatus === "administrator") &&
      (oldStatus === "left" || oldStatus === "kicked" ||
        oldStatus === "restricted")
    ) {
      const { data: myChannel } = await sb.from("telegram_channels")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("bot_token_id", botTokenId)
        .eq("channel_id", chatId)
        .maybeSingle();

      if (myChannel) {
        const user = cm.new_chat_member.user;
        // Track in channel_members (all channels)
        sb.from("channel_members").upsert({
          owner_id: ownerId,
          bot_token_id: botTokenId,
          channel_id: myChannel.id,
          telegram_channel_id: chatId,
          telegram_user_id: userId,
          telegram_username: user.username || null,
          first_name: user.first_name || null,
          last_name: user.last_name || null,
        }, { onConflict: "owner_id,channel_id,telegram_user_id" }).then(
          () => {},
        );

        // Also track in public_channel_members if public channel
        if (publicChannelId && myChannel.id === publicChannelId) {
          sb.from("public_channel_members").upsert({
            owner_id: ownerId,
            bot_token_id: botTokenId,
            channel_id: myChannel.id,
            telegram_user_id: userId,
            telegram_username: user.username || null,
            first_name: user.first_name || null,
            last_name: user.last_name || null,
          }, { onConflict: "owner_id,channel_id,telegram_user_id" }).then(
            () => {},
          );
        }
        console.log(
          `Tracked channel join: user ${userId} in channel ${chatId} (${myChannel.id})`,
        );
      }
    }

    // Remove from channel_members when someone leaves
    if (userId && (newStatus === "left" || newStatus === "kicked")) {
      sb.from("channel_members")
        .delete()
        .eq("owner_id", ownerId)
        .eq("telegram_channel_id", chatId)
        .eq("telegram_user_id", userId)
        .then(() => {});
    }

    // ─── MANDATORY CHANNEL: kick if user leaves it ───
    const wasActive = ["member", "administrator", "creator"].includes(
      oldStatus,
    );
    const isNowInactive = ["left", "kicked", "restricted"].includes(newStatus);
    const userLeft = wasActive && isNowInactive;

    if (mandatoryChatId && userId && userLeft && Number(mandatoryChatId) === Number(chatId)) {
      console.log(
        `User ${userId} left/kicked from mandatory chat ${chatId}, processing...`,
      );
      const mandatoryCh = await getMandatoryChatInfo(botToken, Number(mandatoryChatId));

      if (mandatoryCh) {
        console.log(`Mandatory channel match! Checking subscriber status...`);
        // Check both paid subscribers and free trial users in parallel
        const [subRes, trialRes] = await Promise.all([
          sb.from("telegram_subscribers").select("id, is_permanent, expires_at")
            .eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
              "telegram_user_id",
              userId,
            ).maybeSingle(),
          sb.from("free_trial_users").select("id, expires_at").eq(
            "owner_id",
            ownerId,
          ).eq("bot_token_id", botTokenId).eq("telegram_user_id", userId)
            .maybeSingle(),
        ]);

        const sub = subRes.data;
        const trial = trialRes.data;
        const isActiveSub = sub &&
          (sub.is_permanent ||
            (sub.expires_at && new Date(sub.expires_at) > new Date()));
        const isActiveTrial = trial && new Date(trial.expires_at) > new Date();
        console.log(
          `Sub: ${JSON.stringify(sub)}, Trial: ${
            JSON.stringify(trial)
          }, isActiveSub=${isActiveSub}, isActiveTrial=${isActiveTrial}`,
        );

        // Only enforce mandatory channel for subscribers with ALL channels
        const subHasAll = isActiveSub && sub
          ? await subscriberHasAllChannels(sub.id)
          : false;
        const trialHasAll = isActiveTrial; // Free trial always gets all channels
        if ((subHasAll || trialHasAll) && (isActiveSub || isActiveTrial)) {
          // Get all channels to kick from
          const kickChannelIds: number[] = [];
          if (isActiveSub && sub) {
            const subKickIds = await getKickChannels(
              sub.id,
              ownerId,
              botTokenId,
            );
            for (const id of subKickIds) {
              if (!kickChannelIds.includes(id)) kickChannelIds.push(id);
            }
          }
          if (isActiveTrial) {
            const { data: allCh } = await sb.from("telegram_channels").select(
              "channel_id",
            ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
            for (const c of (allCh || [])) {
              if (!kickChannelIds.includes(c.channel_id)) {
                kickChannelIds.push(c.channel_id);
              }
            }
          }
          if (subscribersChannelId) {
            const { data: subsCh } = await sb.from("telegram_channels").select(
              "channel_id",
            ).eq("id", subscribersChannelId).maybeSingle();
            if (subsCh && !kickChannelIds.includes(subsCh.channel_id)) {
              kickChannelIds.push(subsCh.channel_id);
            }
          }
          // Remove the mandatory channel itself from kick list
          const filteredKickIds = kickChannelIds.filter((id) =>
            Number(id) !== Number(chatId)
          );
          console.log(
            `Kicking user ${userId} from ${filteredKickIds.length} channels: ${
              filteredKickIds.join(",")
            }`,
          );

          if (filteredKickIds.length > 0) {
            const kicked = await kickFromChannels(
              botToken,
              userId,
              filteredKickIds,
            );
            console.log(`Kicked from ${kicked} channels`);
          }
          // Send notification with mandatory channel join button
          const icon = mandatoryCh.channel_type === "group" ? "👥" : "📺";
          const buttons: any[][] = [];
          if (mandatoryCh.invite_link) {
            buttons.push([{
              text: `${icon} انضم إلى ${mandatoryCh.channel_name}`,
              url: mandatoryCh.invite_link,
            }]);
          }
          try {
            const sendRes = await tg(botToken, "sendMessage", {
              chat_id: userId,
              text:
                "🚫 *تم طردك من جميع القنوات والمجموعات!*\n\n❌ لقد غادرت القناة/المجموعة الإجبارية.\n\n⚠️ لن تتمكن من الوصول إلى أي قناة حتى تنضم مرة أخرى.\n\n👇 اضغط على الزر أدناه للانضمام ثم أرسل /start لاستعادة الوصول:",
              parse_mode: "Markdown",
              ...(buttons.length > 0
                ? { reply_markup: { inline_keyboard: buttons } }
                : {}),
            });
            console.log(`Notification sent to ${userId}: ok=${sendRes.ok}`);
          } catch (e) {
            console.error(
              `Failed to send notification to ${userId}:`,
              e.message,
            );
          }
        }
      }
    }
    return;
  }

  // ─── CHAT JOIN REQUESTS ───
  if (update.chat_join_request) {
    const req = update.chat_join_request;
    const telegramUserId = req.from.id;
    const chatId = req.chat.id;
    const firstName = req.from.first_name || "";

    // Parallel: check channel + check subscriber
    const [channelRes, subRes] = await Promise.all([
      sb.from("telegram_channels").select("id").eq("owner_id", ownerId).eq(
        "bot_token_id",
        botTokenId,
      ).eq("channel_id", chatId).maybeSingle(),
      sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq(
        "bot_token_id",
        botTokenId,
      ).eq("telegram_user_id", telegramUserId).maybeSingle(),
    ]);

    const myChannel = channelRes.data;
    if (!myChannel) return;

    // Check if this is the public channel (everyone can join)
    if (publicChannelId && myChannel.id === publicChannelId) {
      // Approve + save member in both tracking tables
      await Promise.all([
        tg(botToken, "approveChatJoinRequest", {
          chat_id: chatId,
          user_id: telegramUserId,
        }),
        sb.from("channel_members").upsert({
          owner_id: ownerId,
          bot_token_id: botTokenId,
          channel_id: myChannel.id,
          telegram_channel_id: chatId,
          telegram_user_id: telegramUserId,
          telegram_username: req.from.username || null,
          first_name: req.from.first_name || null,
          last_name: req.from.last_name || null,
        }, { onConflict: "owner_id,channel_id,telegram_user_id" }),
        sb.from("public_channel_members").upsert({
          owner_id: ownerId,
          bot_token_id: botTokenId,
          channel_id: myChannel.id,
          telegram_user_id: telegramUserId,
          telegram_username: req.from.username || null,
          first_name: req.from.first_name || null,
          last_name: req.from.last_name || null,
        }, { onConflict: "owner_id,channel_id,telegram_user_id" }),
      ]);
      return;
    }

    const sub = subRes.data;

    if (sub) {
      if (
        !sub.is_permanent && sub.expires_at &&
        new Date(sub.expires_at) < new Date()
      ) {
        // Expired - decline + notify in parallel
        await Promise.all([
          tg(botToken, "declineChatJoinRequest", {
            chat_id: chatId,
            user_id: telegramUserId,
          }),
          tg(botToken, "sendMessage", {
            chat_id: telegramUserId,
            text: "⏰ *انتهى اشتراكك!*\n\nتواصل مع المسؤول لتجديد الاشتراك.",
            parse_mode: "Markdown",
          }),
        ]);
      } else {
        // Check if this is the subscribers channel (all active subscribers can join)
        if (subscribersChannelId && myChannel.id === subscribersChannelId) {
          await Promise.all([
            tg(botToken, "approveChatJoinRequest", {
              chat_id: chatId,
              user_id: telegramUserId,
            }),
            sb.from("channel_members").upsert({
              owner_id: ownerId,
              bot_token_id: botTokenId,
              channel_id: myChannel.id,
              telegram_channel_id: chatId,
              telegram_user_id: telegramUserId,
              telegram_username: req.from.username || null,
              first_name: req.from.first_name || null,
              last_name: req.from.last_name || null,
            }, { onConflict: "owner_id,channel_id,telegram_user_id" }),
          ]);
          return;
        }

        const assignedChannelIds = await getSubscriberChannels(sub.id);
        let hasAccess = assignedChannelIds.length === 0 ||
          assignedChannelIds.includes(myChannel.id);

        // If subscriber has more than FULL_ACCESS_THRESHOLD channels assigned,
        // treat as full access (auto-assign any new channel).
        if (!hasAccess && assignedChannelIds.length > FULL_ACCESS_THRESHOLD) {
          await sb.from("subscriber_channels").insert({
            subscriber_id: sub.id,
            channel_id: myChannel.id,
          });
          hasAccess = true;
        }

        if (!hasAccess) {
          await Promise.all([
            tg(botToken, "declineChatJoinRequest", {
              chat_id: chatId,
              user_id: telegramUserId,
            }),
            tg(botToken, "sendMessage", {
              chat_id: telegramUserId,
              text:
                "⛔ *ليس لديك صلاحية لهذه القناة.*\n\nاشتراكك لا يشمل هذه القناة. تواصل مع المسؤول.",
              parse_mode: "Markdown",
            }),
          ]);
          return;
        }

        // Approve + notify subscriber + track channel membership + update info + notify admin
        const updateData: any = {};
        if (req.from.username) updateData.telegram_username = req.from.username;
        if (req.from.first_name) updateData.first_name = req.from.first_name;
        if (req.from.last_name) updateData.last_name = req.from.last_name;

        const promises: Promise<any>[] = [
          tg(botToken, "approveChatJoinRequest", {
            chat_id: chatId,
            user_id: telegramUserId,
          }),
          sb.from("channel_members").upsert({
            owner_id: ownerId,
            bot_token_id: botTokenId,
            channel_id: myChannel.id,
            telegram_channel_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: req.from.username || null,
            first_name: req.from.first_name || null,
            last_name: req.from.last_name || null,
          }, { onConflict: "owner_id,channel_id,telegram_user_id" }),
          tg(botToken, "sendMessage", {
            chat_id: telegramUserId,
            text: `✅ تم قبولك في القناة *${
              req.chat.title || ""
            }*! مرحباً بك 🎉`,
            parse_mode: "Markdown",
          }),
        ];

        if (Object.keys(updateData).length > 0) {
          getUserPhotoUrl(botToken, telegramUserId).then((photoUrl) => {
            if (photoUrl) updateData.photo_url = photoUrl;
            sb.from("telegram_subscribers").update(updateData).eq(
              "owner_id",
              ownerId,
            ).eq("bot_token_id", botTokenId).eq(
              "telegram_user_id",
              telegramUserId,
            );
          });
        }

        if (adminTelegramId) {
          promises.push(tg(botToken, "sendMessage", {
            chat_id: adminTelegramId,
            text:
              `📥 *طلب انضمام مقبول*\n\n👤 ${firstName} (\`${telegramUserId}\`)\n📺 ${
                req.chat.title || chatId
              }`,
            parse_mode: "Markdown",
          }));
        }

        await Promise.all(promises);
      }
    } else {
      // Not a subscriber - decline + notify in parallel
      const promises: Promise<any>[] = [
        tg(botToken, "declineChatJoinRequest", {
          chat_id: chatId,
          user_id: telegramUserId,
        }),
        tg(botToken, "sendMessage", {
          chat_id: telegramUserId,
          text: nonSubMessage,
        }),
      ];
      if (adminTelegramId) {
        promises.push(tg(botToken, "sendMessage", {
          chat_id: adminTelegramId,
          text:
            `🚫 *طلب انضمام مرفوض*\n\n👤 ${firstName} (\`${telegramUserId}\`) — غير مشترك\n📺 ${
              req.chat.title || chatId
            }`,
          parse_mode: "Markdown",
        }));
      }
      await Promise.all(promises);
    }
    return;
  }

  // ─── CHANNEL POSTS (archive messages from monitored channels) ───
  if (update.channel_post || update.edited_channel_post) {
    const post = update.channel_post || update.edited_channel_post;
    try {
      const tgChannelId = post.chat.id;
      // Find matching channel record for this bot
      const { data: chRow } = await sb.from("telegram_channels")
        .select("id")
        .eq("bot_token_id", botTokenId)
        .eq("channel_id", tgChannelId)
        .maybeSingle();

      if (chRow) {
        // Detect media type
        let mediaType: string | null = null;
        let fileId: string | null = null;
        let fileUniqueId: string | null = null;
        let thumbnail: string | null = null;
        let mimeType: string | null = null;
        let fileSize: number | null = null;
        let duration: number | null = null;
        let width: number | null = null;
        let height: number | null = null;

        if (post.photo && post.photo.length) {
          mediaType = "photo";
          const largest = post.photo[post.photo.length - 1];
          fileId = largest.file_id;
          fileUniqueId = largest.file_unique_id;
          width = largest.width;
          height = largest.height;
          fileSize = largest.file_size || null;
          thumbnail = post.photo[0]?.file_id || null;
        } else if (post.video) {
          mediaType = "video";
          fileId = post.video.file_id;
          fileUniqueId = post.video.file_unique_id;
          mimeType = post.video.mime_type || null;
          fileSize = post.video.file_size || null;
          duration = post.video.duration || null;
          width = post.video.width || null;
          height = post.video.height || null;
          thumbnail = post.video.thumbnail?.file_id || null;
        } else if (post.document) {
          mediaType = "document";
          fileId = post.document.file_id;
          fileUniqueId = post.document.file_unique_id;
          mimeType = post.document.mime_type || null;
          fileSize = post.document.file_size || null;
          thumbnail = post.document.thumbnail?.file_id || null;
        } else if (post.audio) {
          mediaType = "audio";
          fileId = post.audio.file_id;
          fileUniqueId = post.audio.file_unique_id;
          mimeType = post.audio.mime_type || null;
          fileSize = post.audio.file_size || null;
          duration = post.audio.duration || null;
        } else if (post.voice) {
          mediaType = "voice";
          fileId = post.voice.file_id;
          fileUniqueId = post.voice.file_unique_id;
          mimeType = post.voice.mime_type || null;
          fileSize = post.voice.file_size || null;
          duration = post.voice.duration || null;
        } else if (post.video_note) {
          mediaType = "video_note";
          fileId = post.video_note.file_id;
          fileUniqueId = post.video_note.file_unique_id;
          duration = post.video_note.duration || null;
        } else if (post.animation) {
          mediaType = "animation";
          fileId = post.animation.file_id;
          fileUniqueId = post.animation.file_unique_id;
          mimeType = post.animation.mime_type || null;
          fileSize = post.animation.file_size || null;
          width = post.animation.width || null;
          height = post.animation.height || null;
          thumbnail = post.animation.thumbnail?.file_id || null;
        } else if (post.sticker) {
          mediaType = "sticker";
          fileId = post.sticker.file_id;
          fileUniqueId = post.sticker.file_unique_id;
          width = post.sticker.width || null;
          height = post.sticker.height || null;
          thumbnail = post.sticker.thumbnail?.file_id || null;
        }

        const senderName = post.author_signature ||
          post.sender_chat?.title ||
          post.chat.title ||
          null;

        await sb.from("channel_messages").upsert({
          bot_token_id: botTokenId,
          owner_id: ownerId,
          channel_id: chRow.id,
          telegram_channel_id: tgChannelId,
          telegram_message_id: post.message_id,
          message_text: post.text || null,
          media_type: mediaType,
          media_file_id: fileId,
          media_file_unique_id: fileUniqueId,
          media_thumbnail: thumbnail,
          media_caption: post.caption || null,
          media_mime_type: mimeType,
          media_file_size: fileSize,
          media_duration: duration,
          media_width: width,
          media_height: height,
          sender_name: senderName,
          sender_username: post.sender_chat?.username || null,
          message_date: new Date((post.date || 0) * 1000).toISOString(),
          raw_data: post,
        }, { onConflict: "channel_id,telegram_message_id" });
      }
    } catch (e) {
      console.error("channel_post archive error:", e);
    }
    return;
  }

  // ─── MESSAGES ───
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;

    // Ignore messages from groups/channels - only respond in private chats
    if (msg.chat.type !== "private") return;
    const text = msg.text || "";
    const fromId = msg.from.id;
    const firstName = msg.from.first_name || "";
    const moderatorIds = await getModeratorIds(botTokenId);
    const isOwnerAdmin = !adminTelegramId || fromId === adminTelegramId;
    const isModerator = !isOwnerAdmin && moderatorIds.has(fromId);
    const isAdmin = isOwnerAdmin || isModerator;

    if (text === "/start") {
      await clearState(chatId, botToken);
      // Save this user to bot_users (fire-and-forget)
      sb.from("bot_users").upsert(
        {
          bot_token_id: botTokenId,
          owner_id: ownerId,
          telegram_user_id: fromId,
          telegram_username: msg.from.username || null,
          first_name: msg.from.first_name || null,
          last_name: msg.from.last_name || null,
        },
        { onConflict: "owner_id,telegram_user_id" },
      ).then(() => {
        // Update photo in background
        enrichUserInfo(botToken, fromId, {
          fn: msg.from.first_name || null,
          ln: msg.from.last_name || null,
          username: msg.from.username || null,
        })
          .then((info) => {
            if (info.photoUrl) {
              sb.from("bot_users").update({ photo_url: info.photoUrl }).eq(
                "owner_id",
                ownerId,
              ).eq("telegram_user_id", fromId);
            }
          });
      });
      if (isAdmin) {
        const [subsRes, channelsRes] = await Promise.all([
          sb.from("telegram_subscribers").select("id, is_permanent, expires_at")
            .eq("owner_id", ownerId).eq("bot_token_id", botTokenId),
          sb.from("telegram_channels").select("id").eq("owner_id", ownerId).eq(
            "bot_token_id",
            botTokenId,
          ),
        ]);
        const subs = subsRes.data || [];
        const total = subs.length;
        const active = subs.filter((s: any) =>
          s.is_permanent ||
          (s.expires_at && new Date(s.expires_at) > new Date())
        ).length;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text:
            `🤖 *لوحة تحكم بوت الاشتراكات*\n\nمرحباً بك يا *${firstName}*! 👋\n\n📊 نظرة سريعة:\n├ 👥 المشتركين: *${active}* نشط من أصل *${total}*\n└ 📺 القنوات: *${
              channelsRes.data?.length || 0
            }*\n\nاختر أحد الخيارات:`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(isModerator),
        });
      } else {
        // ─── NON-ADMIN /start FLOW ───
        const lang = await getUserLang(ownerId, fromId);

        const { data: sub } = await sb.from("telegram_subscribers").select("*")
          .eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
            "telegram_user_id",
            fromId,
          ).maybeSingle();
        const isActiveSub = sub &&
          (sub.is_permanent ||
            (sub.expires_at && new Date(sub.expires_at) > new Date()));

        if (isActiveSub) {
          // ── ACTIVE SUBSCRIBER ──
          // 1. Mandatory channel check first
          if (mandatoryChatId && await subscriberHasAllChannels(sub.id)) {
            const { isMember, channelInfo } = await checkMandatoryChannel(
              botToken,
              mandatoryChatId,
              fromId,
            );
            if (!isMember && channelInfo) {
              const icon = channelInfo.channel_type === "group" ? "👥" : "📺";
              const buttons: any[][] = [];
              if (channelInfo.invite_link) {
                buttons.push([{
                  text: `${icon} ${channelInfo.channel_name}`,
                  url: channelInfo.invite_link,
                }]);
              }
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text: t(lang, "mandatory_required", { name: firstName }),
                parse_mode: "Markdown",
                ...(buttons.length > 0
                  ? { reply_markup: { inline_keyboard: buttons } }
                  : {}),
              });
              return;
            }
          }

          // 2. Show subscriber channels
          const assignedChannelIds = await getSubscriberChannels(sub.id);
          let channels: any[];
          if (assignedChannelIds.length > 0) {
            const { data } = await sb.from("telegram_channels").select(
              "channel_name, invite_link",
            ).in("id", assignedChannelIds);
            channels = data || [];
          } else {
            const { data } = await sb.from("telegram_channels").select(
              "channel_name, invite_link",
            ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
            channels = data || [];
          }

          const subStatus = sub.is_permanent
            ? t(lang, "status_permanent")
            : t(lang, "status_remaining", {
              days: daysRemaining(sub.expires_at!),
              date: formatDate(sub.expires_at!),
            });
          const buttons = channels.filter((ch: any) => ch.invite_link).map((
            ch: any,
          ) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);

          if (subscribersChannelId) {
            const { data: subsCh } = await sb.from("telegram_channels").select(
              "channel_name, invite_link, channel_type",
            ).eq("id", subscribersChannelId).maybeSingle();
            if (subsCh?.invite_link) {
              const icon = subsCh.channel_type === "group" ? "💬" : "📺";
              buttons.push([{
                text: `${icon} ${subsCh.channel_name}`,
                url: subsCh.invite_link,
              }]);
            }
          }
          buttons.push([{
            text: t(lang, "btn_my_sub"),
            callback_data: "my_subscription",
          }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: t(lang, "sub_active_header", {
              name: firstName,
              status: subStatus,
            }),
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: buttons },
          });
        } else if (sub) {
          // ── EXPIRED SUBSCRIBER ──
          let replyMarkup: any = undefined;
          if (publicChannelId) {
            const { data: pubCh } = await sb.from("telegram_channels").select(
              "channel_name, invite_link, channel_type",
            ).eq("id", publicChannelId).maybeSingle();
            if (pubCh?.invite_link) {
              const icon = pubCh.channel_type === "group" ? "👥" : "📺";
              replyMarkup = {
                inline_keyboard: [[{
                  text: `${icon} ${pubCh.channel_name}`,
                  url: pubCh.invite_link,
                }]],
              };
            }
          }
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: t(lang, "sub_expired", {
              name: firstName,
              date: formatDate(sub.expires_at!),
            }),
            parse_mode: "Markdown",
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          });
        } else {
          // ── NOT A SUBSCRIBER ──
          // First-time user with no language preference → show picker
          const { data: existingUser } = await sb.from("bot_users").select(
            "language",
          ).eq("owner_id", ownerId).eq("telegram_user_id", fromId).maybeSingle();
          if (!existingUser?.language) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: t("ar", "pick_lang"),
              reply_markup: langPickerKeyboard(),
            });
            return;
          }

          const buttons: any[][] = [];
          if (publicChannelId) {
            const { data: pubCh } = await sb.from("telegram_channels").select(
              "channel_name, invite_link, channel_type",
            ).eq("id", publicChannelId).maybeSingle();
            if (pubCh?.invite_link) {
              const icon = pubCh.channel_type === "group" ? "👥" : "📺";
              buttons.push([{
                text: `${icon} ${pubCh.channel_name}`,
                url: pubCh.invite_link,
              }]);
            }
          }
          if (freeTrialEnabled) {
            const { data: existingTrial } = await sb.from("free_trial_users")
              .select("id").eq("owner_id", ownerId).eq(
                "telegram_user_id",
                fromId,
              ).maybeSingle();
            if (!existingTrial) {
              buttons.push([{
                text: t(lang, "btn_free_trial", { days: freeTrialDays }),
                callback_data: "activate_free_trial",
              }]);
            }
          }
          const replyMarkup = buttons.length > 0
            ? { inline_keyboard: buttons }
            : undefined;
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: nonSubMessage,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          });
        }
      }
      return;
    }


    if (text === "/lang" || text === "/language" || text === "/اللغة") {
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: t("ar", "pick_lang"),
        reply_markup: langPickerKeyboard(),
      });
      return;
    }

    if (text === "/id" || text === "/myid") {
      const lang = await getUserLang(ownerId, fromId);
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: t(lang, "id_info", {
          id: fromId,
          name: firstName,
          username: msg.from.username || null,
        }),
        parse_mode: "Markdown",
      });
      return;
    }

    if (text === "/cancel" || text === "إلغاء" || text === "cancel") {
      await clearState(chatId, botToken);
      if (isAdmin) {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "❌ تم الإلغاء.",
          reply_markup: adminKeyboard(isModerator),
        });
      } else {
        const lang = await getUserLang(ownerId, fromId);
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: t(lang, "cancelled"),
        });
      }
      return;
    }


    if (!isAdmin) {
      // Check subscription + mandatory channel for non-admin interactions
      const { data: subCheck } = await sb.from("telegram_subscribers").select(
        "id, is_permanent, expires_at",
      ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
        "telegram_user_id",
        fromId,
      ).maybeSingle();
      const isActiveSub = subCheck &&
        (subCheck.is_permanent ||
          (subCheck.expires_at && new Date(subCheck.expires_at) > new Date()));

      if (
        isActiveSub && mandatoryChatId && subCheck &&
        await subscriberHasAllChannels(subCheck.id)
      ) {
        const { isMember, channelInfo } = await checkMandatoryChannel(
          botToken,
          mandatoryChatId,
          fromId,
        );
        if (!isMember && channelInfo) {
          const icon = channelInfo.channel_type === "group" ? "👥" : "📺";
          const buttons: any[][] = [];
          if (channelInfo.invite_link) {
            buttons.push([{
              text: `${icon} ${channelInfo.channel_name}`,
              url: channelInfo.invite_link,
            }]);
          }
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text:
              `⚠️ يجب عليك الانضمام إلى القناة الإجبارية أولاً.\n\nانضم ثم اضغط /start مرة أخرى.`,
            parse_mode: "Markdown",
            ...(buttons.length > 0
              ? { reply_markup: { inline_keyboard: buttons } }
              : {}),
          });
          return;
        }
      }
      if (text === "/status" || text === "/حالتي") {
        if (subCheck) {
          const status = subCheck.is_permanent
            ? "♾ *دائم* — لا ينتهي"
            : subCheck.expires_at && new Date(subCheck.expires_at) > new Date()
            ? `✅ *نشط* — متبقي *${
              daysRemaining(subCheck.expires_at!)
            }* يوم\n📅 ينتهي: ${formatDate(subCheck.expires_at!)}`
            : `❌ *منتهي* منذ ${formatDate(subCheck.expires_at!)}`;
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `📋 *حالة اشتراكك:*\n\n${status}`,
            parse_mode: "Markdown",
          });
        } else {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: nonSubMessage,
          });
        }
        return;
      }
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: nonSubMessage,
      });
      return;
    }

    // ─── ADMIN STATE HANDLING ───
    const currentState = await getState(chatId, botToken);

    if (currentState) {
      switch (currentState.state) {
        case "await_sub_id": {
          let telegramUserId: number | null = null;
          let telegramUsername: string | null = null;
          let userFirstName: string | null = null;
          let userLastName: string | null = null;

          if (msg.forward_from) {
            telegramUserId = msg.forward_from.id;
            telegramUsername = msg.forward_from.username || null;
            userFirstName = msg.forward_from.first_name || null;
            userLastName = msg.forward_from.last_name || null;
          } else if (msg.forward_origin) {
            if (
              msg.forward_origin.type === "user" &&
              msg.forward_origin.sender_user
            ) {
              telegramUserId = msg.forward_origin.sender_user.id;
              telegramUsername = msg.forward_origin.sender_user.username ||
                null;
              userFirstName = msg.forward_origin.sender_user.first_name || null;
              userLastName = msg.forward_origin.sender_user.last_name || null;
            } else if (msg.forward_origin.type === "hidden_user") {
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text:
                "❌ هذا المستخدم أخفى معلوماته.\n\n💡 اطلب منه إرسال /id للبوت، أو أرسل الـ ID الرقمي مباشرة.",
                parse_mode: "Markdown",
              });
              return;
            }
          } else if (msg.forward_sender_name) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text:
                "❌ هذا المستخدم أخفى معلوماته.\n\n💡 اطلب منه إرسال /id للبوت، أو أرسل الـ ID الرقمي مباشرة.",
              parse_mode: "Markdown",
            });
            return;
          } else {
            const input = text.trim().replace(/^@/, "");
            const parsed = parseInt(input);
            if (!isNaN(parsed)) {
              telegramUserId = parsed;
            } else if (input.length > 0) {
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text:
                  `⚠️ لا يمكن تحويل *@${input}* إلى ID مباشرة.\n\n💡 اطلب منه إرسال /id للبوت ثم أرسل لي الرقم.`,
                parse_mode: "Markdown",
              });
              return;
            } else {
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text: "❌ مدخل غير صالح. أرسل الـ ID أو حوّل رسالة.",
              });
              return;
            }
          }

          const { data: existing } = await sb.from("telegram_subscribers")
            .select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId)
            .eq("telegram_user_id", telegramUserId).maybeSingle();
          let existingInfo = "";
          if (existing) {
            const status = existing.is_permanent
              ? "♾ دائم"
              : existing.expires_at &&
                  new Date(existing.expires_at) > new Date()
              ? `✅ نشط (${daysRemaining(existing.expires_at)} يوم)`
              : "❌ منتهي";
            existingInfo =
              `\n\n⚠️ *مشترك حالياً:* ${status}\nسيتم تحديث الاشتراك.`;
          }

          await setState(chatId, botToken, "await_sub_days", {
            telegramUserId,
            telegramUsername,
            userFirstName,
            userLastName,
          });

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ المعرف: \`${telegramUserId}\`${
              telegramUsername ? ` (@${telegramUsername})` : ""
            }${existingInfo}\n\n📅 اختر مدة الاشتراك:`,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "7 أيام", callback_data: "days_7" }, {
                  text: "15 يوم",
                  callback_data: "days_15",
                }, { text: "30 يوم", callback_data: "days_30" }],
                [{ text: "60 يوم", callback_data: "days_60" }, {
                  text: "90 يوم",
                  callback_data: "days_90",
                }, { text: "180 يوم", callback_data: "days_180" }],
                [{ text: "365 يوم", callback_data: "days_365" }, {
                  text: "♾ دائم",
                  callback_data: "days_permanent",
                }],
                [{ text: "✏️ إدخال يدوي", callback_data: "days_custom" }],
                [{ text: "❌ إلغاء", callback_data: "cancel_action" }],
              ],
            },
          });
          return;
        }

        case "await_sub_days": {
          const {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
          } = currentState.data;
          const isPermanent = text.trim() === "دائم";
          const days = isPermanent ? null : parseInt(text.trim());

          if (!isPermanent && (isNaN(days!) || days! <= 0)) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text:
                "❌ أدخل رقماً صحيحاً (مثال: 30) أو اكتب *دائم*\n\n_أرسل /cancel للإلغاء_",
              parse_mode: "Markdown",
            });
            return;
          }

          const { data: channels } = await sb.from("telegram_channels").select(
            "id, channel_name",
          ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);

          if (!channels || channels.length === 0) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(
              botToken,
              chatId,
              ownerId,
              botTokenId,
              telegramUserId,
              telegramUsername,
              fn,
              ln,
              days,
              isPermanent,
              [], isModerator);
            return;
          }

          if (channels.length === 1) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(
              botToken,
              chatId,
              ownerId,
              botTokenId,
              telegramUserId,
              telegramUsername,
              fn,
              ln,
              days,
              isPermanent,
              [channels[0].id], isModerator);
            return;
          }

          await setState(chatId, botToken, "await_sub_channels", {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
            days,
            isPermanent,
            selectedChannels: [],
          });

          const channelButtons = channels.map((
            ch: any,
          ) => [{
            text: `⬜ ${ch.channel_name}`,
            callback_data: `toggle_ch_${ch.id}`,
          }]);
          channelButtons.push([{
            text: "✅ الكل",
            callback_data: "select_all_channels",
          }]);
          channelButtons.push([{
            text: "📥 تأكيد الاختيار",
            callback_data: "confirm_channels",
          }]);
          channelButtons.push([{
            text: "❌ إلغاء",
            callback_data: "cancel_action",
          }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text:
              "📺 *اختر القنوات للمشترك:*\n\nاضغط على القناة لتحديدها/إلغاء تحديدها، ثم اضغط تأكيد.",
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: channelButtons },
          });
          return;
        }

        case "await_sub_days_custom": {
          const {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
          } = currentState.data;
          const days = parseInt(text.trim());

          if (isNaN(days) || days <= 0 || days > 9999) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ أدخل رقماً صحيحاً بين 1 و 9999\n\n_أرسل /cancel للإلغاء_",
              parse_mode: "Markdown",
            });
            return;
          }

          const { data: channels } = await sb.from("telegram_channels").select(
            "id, channel_name",
          ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);

          if (!channels || channels.length === 0) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(
              botToken,
              chatId,
              ownerId,
              botTokenId,
              telegramUserId,
              telegramUsername,
              fn,
              ln,
              days,
              false,
              [], isModerator);
            return;
          }

          if (channels.length === 1) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(
              botToken,
              chatId,
              ownerId,
              botTokenId,
              telegramUserId,
              telegramUsername,
              fn,
              ln,
              days,
              false,
              [channels[0].id], isModerator);
            return;
          }

          await setState(chatId, botToken, "await_sub_channels", {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
            days,
            isPermanent: false,
            selectedChannels: [],
          });

          const channelBtns = channels.map((
            ch: any,
          ) => [{
            text: `⬜ ${ch.channel_name}`,
            callback_data: `toggle_ch_${ch.id}`,
          }]);
          channelBtns.push([{
            text: "✅ الكل",
            callback_data: "select_all_channels",
          }]);
          channelBtns.push([{
            text: "📥 تأكيد الاختيار",
            callback_data: "confirm_channels",
          }]);
          channelBtns.push([{
            text: "❌ إلغاء",
            callback_data: "cancel_action",
          }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text:
              "📺 *اختر القنوات للمشترك:*\n\nاضغط على القناة لتحديدها/إلغاء تحديدها، ثم اضغط تأكيد.",
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: channelBtns },
          });
          return;
        }

        case "await_channel": {
          let channelId: number | null = null;

          if (msg.forward_from_chat) {
            channelId = msg.forward_from_chat.id;
          } else if (
            msg.forward_origin && msg.forward_origin.type === "channel" &&
            msg.forward_origin.chat
          ) {
            channelId = msg.forward_origin.chat.id;
          } else if (
            msg.forward_origin && msg.forward_origin.type === "chat" &&
            msg.forward_origin.sender_chat
          ) {
            channelId = msg.forward_origin.sender_chat.id;
          } else {
            const input = text.trim().replace(/^@/, "");
            const parsed = parseInt(input);
            if (!isNaN(parsed)) {
              channelId = parsed;
            } else if (input.length > 0) {
              const resolved = await tg(botToken, "getChat", {
                chat_id: `@${input}`,
              });
              if (resolved.ok) {
                channelId = resolved.result.id;
              } else {
                await tg(botToken, "sendMessage", {
                  chat_id: chatId,
                  text:
                    `❌ لم يتم العثور على *@${input}*\n\n💡 تأكد أن البوت مسؤول فيها.`,
                  parse_mode: "Markdown",
                });
                return;
              }
            } else {
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text: "❌ مدخل غير صالح.",
              });
              return;
            }
          }

          await clearState(chatId, botToken);

          // Parallel: getChat + getMe
          const [chatInfo, botMe] = await Promise.all([
            tg(botToken, "getChat", { chat_id: channelId }),
            tg(botToken, "getMe", {}),
          ]);
          const channelName = chatInfo.ok
            ? chatInfo.result.title || `قناة ${channelId}`
            : `قناة ${channelId}`;
          // Auto-detect type: group/supergroup vs channel
          const chatType = chatInfo.ok ? chatInfo.result.type : "channel";
          const channelType =
            (chatType === "group" || chatType === "supergroup")
              ? "group"
              : "channel";
          const typeEmoji = channelType === "group" ? "👥" : "📺";

          if (chatInfo.ok) {
            const memberInfo = await tg(botToken, "getChatMember", {
              chat_id: channelId,
              user_id: botMe.result.id,
            });
            if (
              !memberInfo.ok ||
              !["administrator", "creator"].includes(memberInfo.result?.status)
            ) {
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text:
                  `⚠️ البوت *ليس مسؤولاً* في *${channelName}*\n\nأضف البوت كمسؤول أولاً.`,
                parse_mode: "Markdown",
                reply_markup: adminKeyboard(isModerator),
              });
              return;
            }
          }

          const linkRes = await tg(botToken, "createChatInviteLink", {
            chat_id: channelId,
            creates_join_request: true,
            name: `bot_invite_${channelId}`,
          });
          if (!linkRes.ok) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text:
                `❌ فشل إنشاء رابط الدعوة\n\n💡 تأكد أن البوت لديه صلاحية *دعوة أعضاء*.`,
              parse_mode: "Markdown",
              reply_markup: adminKeyboard(isModerator),
            });
            return;
          }

          const { data: newChannel, error } = await sb.from("telegram_channels")
            .upsert(
              {
                owner_id: ownerId,
                bot_token_id: botTokenId,
                channel_id: channelId,
                channel_name: channelName,
                invite_link: linkRes.result.invite_link,
                channel_type: channelType,
              },
              { onConflict: "owner_id,channel_id" },
            ).select("id").single();

          if (error) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ خطأ: " + error.message,
              reply_markup: adminKeyboard(isModerator),
            });
            return;
          }

          // Auto-assign channel to subscribers
          const newChannelId = newChannel.id;
          const [allChannelsRes, allSubsRes] = await Promise.all([
            sb.from("telegram_channels").select("id").eq("owner_id", ownerId)
              .eq("bot_token_id", botTokenId),
            sb.from("telegram_subscribers").select("id").eq("owner_id", ownerId)
              .eq("bot_token_id", botTokenId),
          ]);

          const otherChannelIds = (allChannelsRes.data || []).map((ch: any) =>
            ch.id
          ).filter((id: string) => id !== newChannelId);
          const allSubs = allSubsRes.data || [];

          if (otherChannelIds.length > 0 && allSubs.length > 0) {
            // Batch: get all subscriber_channels at once
            const subIds = allSubs.map((s: any) => s.id);
            const channelMap = await getSubscriberChannelsBatch(subIds);

            const autoAssignRows: any[] = [];
            for (const sub of allSubs) {
              const subChannels = channelMap[sub.id] || [];
              // Auto-assign if: subscriber owns ALL existing channels,
              // OR has more than FULL_ACCESS_THRESHOLD channels (full-access tier).
              const hasAllChannels = subChannels.length >= otherChannelIds.length &&
                otherChannelIds.every((id: string) => subChannels.includes(id));
              const hasFullAccessTier = subChannels.length > FULL_ACCESS_THRESHOLD;
              if (hasAllChannels || hasFullAccessTier) {
                autoAssignRows.push({
                  subscriber_id: sub.id,
                  channel_id: newChannelId,
                });
              }
            }

            if (autoAssignRows.length > 0) {
              await sb.from("subscriber_channels").insert(autoAssignRows);
              tgFire(botToken, "sendMessage", {
                chat_id: chatId,
                text:
                  `📌 تم إضافة القناة الجديدة تلقائياً لـ *${autoAssignRows.length}* مشترك يملكون جميع القنوات.`,
                parse_mode: "Markdown",
              });
            }
          } else if (otherChannelIds.length === 0 && allSubs.length > 0) {
            const rows = allSubs.map((s: any) => ({
              subscriber_id: s.id,
              channel_id: newChannelId,
            }));
            await sb.from("subscriber_channels").insert(rows);
          }

          const membersRes = await tg(botToken, "getChatMemberCount", {
            chat_id: channelId,
          });
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ *تمت الإضافة بنجاح!*\n\n${typeEmoji} *${channelName}* (${
              channelType === "group" ? "مجموعة" : "قناة"
            })\n🆔 \`${channelId}\`\n👥 الأعضاء: ${
              membersRes.ok ? membersRes.result : "—"
            }\n🔗 [رابط الدعوة](${linkRes.result.invite_link})`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(isModerator),
          });
          return;
        }

        case "await_broadcast": {
          await clearState(chatId, botToken);
          const { data: botUsersRows } = await sb.from("bot_users").select(
            "telegram_user_id",
          ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
          const activeSubs = (botUsersRows || []).map((u: any) => ({
            telegram_user_id: u.telegram_user_id,
          }));

          const { sent, failed } = await broadcastConcurrent(
            botToken,
            activeSubs,
            msg,
            chatId,
            text,
          );

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text:
              `📢 *تم الإرسال!*\n\n✅ نجح: *${sent}*\n❌ فشل: *${failed}*\n📊 الإجمالي: ${activeSubs.length}`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(isModerator),
          });
          return;
        }

        case "await_search": {
          await clearState(chatId, botToken);
          const input = text.trim().replace(/^@/, "");
          const parsed = parseInt(input);

          let sub: any = null;
          if (!isNaN(parsed)) {
            const { data } = await sb.from("telegram_subscribers").select("*")
              .eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
                "telegram_user_id",
                parsed,
              ).maybeSingle();
            sub = data;
          } else if (input.length > 0) {
            const { data } = await sb.from("telegram_subscribers").select("*")
              .eq("owner_id", ownerId).eq("bot_token_id", botTokenId).ilike(
                "telegram_username",
                `%${input}%`,
              ).maybeSingle();
            sub = data;
          }

          if (sub) {
            const assignedChannelIds = await getSubscriberChannels(sub.id);
            let channelInfo = "";
            if (assignedChannelIds.length > 0) {
              const { data: chNames } = await sb.from("telegram_channels")
                .select("channel_name").in("id", assignedChannelIds);
              channelInfo = `\n📺 القنوات: ${
                (chNames || []).map((c: any) => c.channel_name).join("، ")
              }`;
            } else {
              channelInfo = "\n📺 القنوات: جميع القنوات";
            }

            const status = sub.is_permanent
              ? "♾ دائم"
              : sub.expires_at && new Date(sub.expires_at) > new Date()
              ? `✅ نشط (${daysRemaining(sub.expires_at)} يوم)\n📅 ينتهي: ${
                formatDate(sub.expires_at)
              }`
              : `❌ منتهي منذ ${formatDate(sub.expires_at)}`;
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: `🔍 *نتيجة البحث:*\n\n🆔 \`${sub.telegram_user_id}\`\n${
                sub.telegram_username ? `📛 @${sub.telegram_username}\n` : ""
              }📋 ${status}${channelInfo}\n📅 أضيف: ${
                formatDate(sub.created_at)
              }`,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[{
                  text: "🗑 حذف",
                  callback_data: `del_sub_${sub.telegram_user_id}`,
                }], [{ text: "🔙 رجوع", callback_data: "back" }]],
              },
            });
          } else {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ لم يتم العثور على مشترك.",
              reply_markup: adminKeyboard(isModerator),
            });
          }
          return;
        }

        case "await_delete_sub": {
          await clearState(chatId, botToken);
          const parsed = parseInt(text.trim());
          if (isNaN(parsed)) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ أرسل رقم ID فقط.",
              reply_markup: adminKeyboard(isModerator),
            });
            return;
          }

          const { data: sub } = await sb.from("telegram_subscribers").select(
            "*",
          ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
            "telegram_user_id",
            parsed,
          ).maybeSingle();
          if (!sub) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ المشترك غير موجود.",
              reply_markup: adminKeyboard(isModerator),
            });
            return;
          }

          const channelsToKick = await getKickChannels(
            sub.id,
            ownerId,
            botTokenId,
          );
          const kicked = await kickFromChannels(
            botToken,
            parsed,
            channelsToKick,
          );
          await sb.from("telegram_subscribers").delete().eq("id", sub.id);

          await Promise.all([
            tg(botToken, "sendMessage", {
              chat_id: chatId,
              text:
                `✅ *تم حذف المشترك* \`${parsed}\`\n🚫 طُرد من *${kicked}* قناة`,
              parse_mode: "Markdown",
              reply_markup: adminKeyboard(isModerator),
            }),
            tg(botToken, "sendMessage", {
              chat_id: parsed,
              text: "⚠️ تم إلغاء اشتراكك وإزالتك من القنوات.",
            }),
          ]);
          return;
        }

        case "await_sub_channels": {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "💡 اضغط على الأزرار لاختيار القنوات ثم اضغط *تأكيد الاختيار*.",
            parse_mode: "Markdown",
          });
          return;
        }
      }
    }

    return;
  }

  // ─── CALLBACK QUERIES ───
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const cbFromId = cb.from.id;
    const data = cb.data;

    if (data === "set_lang_ar" || data === "set_lang_en") {
      const newLang: Lang = data === "set_lang_en" ? "en" : "ar";
      await sb.from("bot_users").upsert(
        {
          bot_token_id: botTokenId,
          owner_id: ownerId,
          telegram_user_id: cbFromId,
          telegram_username: cb.from.username || null,
          first_name: cb.from.first_name || null,
          last_name: cb.from.last_name || null,
          language: newLang,
        },
        { onConflict: "owner_id,telegram_user_id" },
      );
      await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id });
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: t(newLang, "lang_saved"),
      });
      return;
    }

    if (data === "my_subscription") {
      const lang = await getUserLang(ownerId, cbFromId);
      const { data: sub } = await sb.from("telegram_subscribers").select("*")
        .eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
          "telegram_user_id",
          cbFromId,
        ).maybeSingle();
      await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id });
      if (sub) {
        const assignedChannelIds = await getSubscriberChannels(sub.id);
        let channelInfo = "";
        if (assignedChannelIds.length > 0) {
          const { data: chNames } = await sb.from("telegram_channels").select(
            "channel_name",
          ).in("id", assignedChannelIds);
          channelInfo = t(lang, "my_sub_channels", {
            list: (chNames || []).map((c: any) => c.channel_name).join(
              lang === "ar" ? "، " : ", ",
            ),
          });
        }

        const status = sub.is_permanent
          ? t(lang, "status_permanent")
          : sub.expires_at && new Date(sub.expires_at) > new Date()
          ? t(lang, "my_sub_status_active", {
            date: formatDate(sub.expires_at),
            days: daysRemaining(sub.expires_at),
          })
          : t(lang, "my_sub_status_expired", {
            date: formatDate(sub.expires_at!),
          });
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: t(lang, "my_sub_card", {
            status,
            channels: channelInfo,
            date: formatDate(sub.created_at),
          }),
          parse_mode: "Markdown",
        });
      }
      return;
    }

    if (data === "activate_free_trial") {
      const lang = await getUserLang(ownerId, cbFromId);
      await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id });

      if (!freeTrialEnabled) {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: t(lang, "trial_unavailable"),
        });
        return;
      }

      // Check if already used
      const { data: existingTrial } = await sb.from("free_trial_users").select(
        "id",
      ).eq("owner_id", ownerId).eq("telegram_user_id", cbFromId).maybeSingle();
      if (existingTrial) {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: t(lang, "trial_already_used"),
        });
        return;
      }


      const expiresAt = new Date(Date.now() + freeTrialDays * 86400000).toISOString();

      // Save trial user
      await sb.from("free_trial_users").insert({
        bot_token_id: botTokenId,
        owner_id: ownerId,
        telegram_user_id: cbFromId,
        telegram_username: cb.from.username || null,
        first_name: cb.from.first_name || null,
        last_name: cb.from.last_name || null,
        expires_at: expiresAt,
      });

      // Determine which channels the trial user gets
      let trialChannelIds: string[] = freeTrialChannelIds.length > 0
        ? [...freeTrialChannelIds]
        : [];
      let channelsForLinks: any[] = [];

      if (trialChannelIds.length > 0) {
        // Use specific trial channels
        const { data: selectedChannels } = await sb.from("telegram_channels")
          .select("id, channel_name, invite_link").in("id", trialChannelIds);
        channelsForLinks = selectedChannels || [];
      } else {
        // No specific channels = all channels
        const { data: allChannels } = await sb.from("telegram_channels").select(
          "id, channel_name, invite_link",
        ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        channelsForLinks = allChannels || [];
        trialChannelIds = (allChannels || []).map((ch: any) => ch.id);
      }

      // Create subscriber with 3 days trial
      const { data: upsertedSub } = await sb.from("telegram_subscribers")
        .upsert(
          {
            owner_id: ownerId,
            bot_token_id: botTokenId,
            telegram_user_id: cbFromId,
            telegram_username: cb.from.username || null,
            first_name: cb.from.first_name || null,
            last_name: cb.from.last_name || null,
            subscription_days: 3,
            expires_at: expiresAt,
            is_permanent: false,
            expiry_notified: false,
          },
          { onConflict: "owner_id,telegram_user_id" },
        ).select("id").single();

      if (upsertedSub && trialChannelIds.length > 0) {
        await sb.from("subscriber_channels").delete().eq(
          "subscriber_id",
          upsertedSub.id,
        );
        const rows = trialChannelIds.map((chId: string) => ({
          subscriber_id: upsertedSub.id,
          channel_id: chId,
        }));
        await sb.from("subscriber_channels").insert(rows);
      }

      // Check mandatory channel before showing channel links
      if (mandatoryChatId) {
        const { isMember, channelInfo } = await checkMandatoryChannel(
          botToken,
          mandatoryChatId,
          cbFromId,
        );
        if (!isMember && channelInfo) {
          const mIcon = channelInfo.channel_type === "group" ? "👥" : "📺";
          const mButtons: any[][] = [];
          if (channelInfo.invite_link) {
            mButtons.push([{
              text: `${mIcon} ${channelInfo.channel_name}`,
              url: channelInfo.invite_link,
            }]);
          }
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text:
              `🎉 *تم تفعيل التجربة المجانية!*\n\n📅 المدة: *3 أيام*\n⏰ تنتهي: ${
                formatDate(expiresAt)
              }\n\n⚠️ يجب عليك الانضمام إلى القناة الإجبارية أولاً للوصول إلى القنوات.\n\nانضم ثم اضغط /start`,
            parse_mode: "Markdown",
            ...(mButtons.length > 0
              ? { reply_markup: { inline_keyboard: mButtons } }
              : {}),
          });
          if (adminTelegramId) {
            tgFire(botToken, "sendMessage", {
              chat_id: adminTelegramId,
              text: `🎁 *تجربة مجانية جديدة*\n\n👤 ${
                cb.from.first_name || ""
              } (\`${cbFromId}\`)\n📅 تنتهي: ${formatDate(expiresAt)}`,
              parse_mode: "Markdown",
            });
          }
          return;
        }
      }

      const buttons = channelsForLinks.filter((ch: any) => ch.invite_link).map((
        ch: any,
      ) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);

      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text:
          `🎉 *تم تفعيل التجربة المجانية!*\n\n📅 المدة: *3 أيام*\n⏰ تنتهي: ${
            formatDate(expiresAt)
          }\n\n📺 اضغط على القنوات للانضمام:`,
        parse_mode: "Markdown",
        reply_markup: buttons.length > 0
          ? { inline_keyboard: buttons }
          : undefined,
      });

      // Notify admin
      if (adminTelegramId) {
        tgFire(botToken, "sendMessage", {
          chat_id: adminTelegramId,
          text: `🎁 *تجربة مجانية جديدة*\n\n👤 ${
            cb.from.first_name || ""
          } (\`${cbFromId}\`)\n📅 تنتهي: ${formatDate(expiresAt)}`,
          parse_mode: "Markdown",
        });
      }
      return;
    }

    const cbModeratorIds = await getModeratorIds(botTokenId);
    const isCbOwnerAdmin = !adminTelegramId || cbFromId === adminTelegramId;
    const isModerator = !isCbOwnerAdmin && cbModeratorIds.has(cbFromId);
    const isCbAdmin = isCbOwnerAdmin || isModerator;
    if (!isCbAdmin) {
      await tg(botToken, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "⛔ غير مصرح لك",
      });
      return;
    }

    await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id });

    // ── Channel selection toggle ──
    if (data.startsWith("toggle_ch_")) {
      const channelUuid = data.replace("toggle_ch_", "");
      const currentSt = await getState(chatId, botToken);
      if (!currentSt || currentSt.state !== "await_sub_channels") return;

      const selected: string[] = currentSt.data.selectedChannels || [];
      const idx = selected.indexOf(channelUuid);
      if (idx >= 0) selected.splice(idx, 1);
      else selected.push(channelUuid);

      // Parallel: update state + fetch channels
      const [, channelsRes] = await Promise.all([
        setState(chatId, botToken, "await_sub_channels", {
          ...currentSt.data,
          selectedChannels: selected,
        }),
        sb.from("telegram_channels").select("id, channel_name").eq(
          "owner_id",
          ownerId,
        ).eq("bot_token_id", botTokenId),
      ]);

      const channels = channelsRes.data || [];
      const channelButtons = channels.map((ch: any) => {
        const isSelected = selected.includes(ch.id);
        return [{
          text: `${isSelected ? "✅" : "⬜"} ${ch.channel_name}`,
          callback_data: `toggle_ch_${ch.id}`,
        }];
      });
      channelButtons.push([{
        text: "✅ الكل",
        callback_data: "select_all_channels",
      }]);
      channelButtons.push([{
        text: `📥 تأكيد الاختيار (${selected.length})`,
        callback_data: "confirm_channels",
      }]);
      channelButtons.push([{
        text: "❌ إلغاء",
        callback_data: "cancel_action",
      }]);

      await tg(botToken, "editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: channelButtons },
      });
      return;
    }

    if (data === "select_all_channels") {
      const currentSt = await getState(chatId, botToken);
      if (!currentSt || currentSt.state !== "await_sub_channels") return;

      const { data: channels } = await sb.from("telegram_channels").select(
        "id, channel_name",
      ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
      const allIds = (channels || []).map((ch: any) => ch.id);

      await setState(chatId, botToken, "await_sub_channels", {
        ...currentSt.data,
        selectedChannels: allIds,
      });

      const channelButtons = (channels || []).map((
        ch: any,
      ) => [{
        text: `✅ ${ch.channel_name}`,
        callback_data: `toggle_ch_${ch.id}`,
      }]);
      channelButtons.push([{
        text: "✅ الكل",
        callback_data: "select_all_channels",
      }]);
      channelButtons.push([{
        text: `📥 تأكيد الاختيار (${allIds.length})`,
        callback_data: "confirm_channels",
      }]);
      channelButtons.push([{
        text: "❌ إلغاء",
        callback_data: "cancel_action",
      }]);

      await tg(botToken, "editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: channelButtons },
      });
      return;
    }

    if (data === "confirm_channels") {
      const currentSt = await getState(chatId, botToken);
      if (!currentSt || currentSt.state !== "await_sub_channels") return;

      const {
        telegramUserId,
        telegramUsername,
        userFirstName: fn,
        userLastName: ln,
        days,
        isPermanent,
        selectedChannels,
      } = currentSt.data;

      if (!selectedChannels || selectedChannels.length === 0) {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ يجب اختيار قناة واحدة على الأقل!",
        });
        return;
      }

      await clearState(chatId, botToken);
      await finalizeSubscriber(
        botToken,
        chatId,
        ownerId,
        botTokenId,
        telegramUserId,
        telegramUsername,
        fn,
        ln,
        days,
        isPermanent,
        selectedChannels, isModerator);
      return;
    }

    // Block moderator from non-subscriber-management actions
    if (isModerator && ["manage_channels", "add_channel", "broadcast", "stats"].includes(data)) {
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: "⛔ هذه الميزة متاحة لمالك البوت فقط.",
        reply_markup: adminKeyboard(isModerator),
      });
      return;
    }

    switch (data) {
      case "add_subscriber": {
        await setState(chatId, botToken, "await_sub_id");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text:
            "👤 *إضافة مشترك*\n\nأرسل معرف المستخدم بإحدى الطرق:\n\n1️⃣ الـ Telegram ID (رقم)\n2️⃣ حوّل (Forward) رسالة منه\n\n💡 يمكنه معرفة ID بإرسال /id للبوت\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "list_subscribers": {
        await clearState(chatId, botToken);
        const { data: subs } = await sb.from("telegram_subscribers").select("*")
          .eq("owner_id", ownerId).eq("bot_token_id", botTokenId).order(
            "created_at",
            { ascending: false },
          ).limit(20);
        if (!subs || subs.length === 0) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "📋 لا يوجد مشتركون حالياً.",
            reply_markup: adminKeyboard(isModerator),
          });
        } else {
          // Batch fetch all channel assignments (fixes N+1)
          const subIds = subs.map((s: any) => s.id);
          const channelMap = await getSubscriberChannelsBatch(subIds);

          let msgText = `📋 *المشتركون (${subs.length}):*\n\n`;
          for (const s of subs) {
            const st = s.is_permanent
              ? "♾"
              : s.expires_at && new Date(s.expires_at) > new Date()
              ? `✅ ${daysRemaining(s.expires_at)}ي`
              : "❌";
            const chCount = (channelMap[s.id] || []).length;
            const chLabel = chCount > 0 ? ` (📺${chCount})` : "";
            msgText += `${st} \`${s.telegram_user_id}\`${
              s.telegram_username ? ` @${s.telegram_username}` : ""
            }${chLabel}\n`;
          }
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: msgText,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(isModerator),
          });
        }
        break;
      }

      case "manage_channels": {
        await clearState(chatId, botToken);
        const { data: channels } = await sb.from("telegram_channels").select(
          "*",
        ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        if (!channels || channels.length === 0) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "📺 لا توجد قنوات أو مجموعات.",
            reply_markup: adminKeyboard(isModerator),
          });
        } else {
          let msgText = `📺 *القنوات والمجموعات (${channels.length}):*\n\n`;
          const buttons = [];
          for (const ch of channels) {
            const typeEmoji = ch.channel_type === "group" ? "👥" : "📺";
            const typeLabel = ch.channel_type === "group" ? "مجموعة" : "قناة";
            msgText +=
              `${typeEmoji} *${ch.channel_name}* (${typeLabel})\n  🆔 \`${ch.channel_id}\`${
                ch.invite_link ? " — 🔗 رابط متاح" : ""
              }\n`;
            buttons.push([{
              text: `🗑 حذف ${ch.channel_name}`,
              callback_data: `del_ch_${ch.channel_id}`,
            }]);
          }
          buttons.push([{ text: "🔙 رجوع", callback_data: "back" }]);
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: msgText,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: buttons },
          });
        }
        break;
      }

      case "add_channel": {
        await setState(chatId, botToken, "await_channel");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text:
            "📺 *إضافة قناة أو مجموعة*\n\nأرسل بإحدى الطرق:\n\n1️⃣ معرف القناة/المجموعة (رقم سالب)\n2️⃣ @username\n3️⃣ حوّل رسالة من القناة/المجموعة\n\n⚠️ البوت يجب أن يكون مسؤولاً!\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "broadcast": {
        const { count: active } = await sb.from("bot_users").select(
          "telegram_user_id",
          { count: "exact", head: true },
        ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        await setState(chatId, botToken, "await_broadcast");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text:
            `📢 *رسالة جماعية*\n\nسيتم إرسالها لـ *${active ?? 0}* مستخدم (جميع من استخدم البوت).\n\nأرسل الرسالة الآن (نص، صورة، فيديو...):\n\n_أرسل /cancel للإلغاء_`,
          parse_mode: "Markdown",
        });
        break;
      }

      case "search_subscriber": {
        await setState(chatId, botToken, "await_search");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text:
            "🔍 *بحث عن مشترك*\n\nأرسل الـ ID أو @username:\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "delete_subscriber": {
        await setState(chatId, botToken, "await_delete_sub");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text:
            "🗑 *حذف مشترك*\n\nأرسل الـ ID الرقمي للمشترك:\n\n⚠️ سيتم طرده من القنوات نهائياً.\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "stats": {
        await clearState(chatId, botToken);
        // Parallel fetch
        const [subsRes, channelsRes] = await Promise.all([
          sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId)
            .eq("bot_token_id", botTokenId),
          sb.from("telegram_channels").select("*").eq("owner_id", ownerId).eq(
            "bot_token_id",
            botTokenId,
          ),
        ]);
        const subs = subsRes.data || [];
        const total = subs.length;
        const active = subs.filter((s: any) =>
          s.is_permanent ||
          (s.expires_at && new Date(s.expires_at) > new Date())
        ).length;
        const permanent = subs.filter((s: any) => s.is_permanent).length;
        const expiringSoon = subs.filter((s: any) =>
          !s.is_permanent && s.expires_at &&
          new Date(s.expires_at) > new Date() &&
          daysRemaining(s.expires_at) <= 3
        ).length;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text:
            `📊 *الإحصائيات:*\n\n👥 *المشتركين:*\n├ إجمالي: *${total}*\n├ ✅ نشطون: *${active}*\n├ ♾ دائمون: *${permanent}*\n├ ❌ منتهيون: *${
              total - active
            }*\n└ ⚠️ ينتهي خلال 3 أيام: *${expiringSoon}*\n\n📺 *القنوات:* ${
              channelsRes.data?.length || 0
            }`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(isModerator),
        });
        break;
      }

      case "cancel_action": {
        await clearState(chatId, botToken);
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "❌ تم الإلغاء.",
          reply_markup: adminKeyboard(isModerator),
        });
        break;
      }

      case "back": {
        await clearState(chatId, botToken);
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "🤖 *لوحة التحكم*",
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(isModerator),
        });
        break;
      }

      default: {
        if (data === "days_custom") {
          const currentSt = await getState(chatId, botToken);
          if (!currentSt || currentSt.state !== "await_sub_days") {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "⚠️ انتهت صلاحية العملية. أعد المحاولة.",
              reply_markup: adminKeyboard(isModerator),
            });
            break;
          }
          const {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
          } = currentSt.data;
          await setState(chatId, botToken, "await_sub_days_custom", {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
          });
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text:
              "✏️ *أدخل عدد الأيام يدوياً:*\n\nأرسل رقماً بين 1 و 9999\n\n_أرسل /cancel للإلغاء_",
            parse_mode: "Markdown",
          });
          break;
        }

        if (data.startsWith("days_")) {
          const currentSt = await getState(chatId, botToken);
          if (!currentSt || currentSt.state !== "await_sub_days") {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "⚠️ انتهت صلاحية العملية. أعد المحاولة.",
              reply_markup: adminKeyboard(isModerator),
            });
            break;
          }
          const {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
          } = currentSt.data;
          const isPermanent = data === "days_permanent";
          const days = isPermanent ? null : parseInt(data.replace("days_", ""));

          const { data: channels } = await sb.from("telegram_channels").select(
            "id, channel_name",
          ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId);

          if (!channels || channels.length === 0) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(
              botToken,
              chatId,
              ownerId,
              botTokenId,
              telegramUserId,
              telegramUsername,
              fn,
              ln,
              days,
              isPermanent,
              [], isModerator);
            break;
          }

          if (channels.length === 1) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(
              botToken,
              chatId,
              ownerId,
              botTokenId,
              telegramUserId,
              telegramUsername,
              fn,
              ln,
              days,
              isPermanent,
              [channels[0].id], isModerator);
            break;
          }

          await setState(chatId, botToken, "await_sub_channels", {
            telegramUserId,
            telegramUsername,
            userFirstName: fn,
            userLastName: ln,
            days,
            isPermanent,
            selectedChannels: [],
          });

          const channelButtons = channels.map((
            ch: any,
          ) => [{
            text: `⬜ ${ch.channel_name}`,
            callback_data: `toggle_ch_${ch.id}`,
          }]);
          channelButtons.push([{
            text: "✅ الكل",
            callback_data: "select_all_channels",
          }]);
          channelButtons.push([{
            text: "📥 تأكيد الاختيار (0)",
            callback_data: "confirm_channels",
          }]);
          channelButtons.push([{
            text: "❌ إلغاء",
            callback_data: "cancel_action",
          }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text:
              "📺 *اختر القنوات للمشترك:*\n\nاضغط على القناة لتحديدها/إلغاء تحديدها، ثم اضغط تأكيد.",
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: channelButtons },
          });
          break;
        }

        if (data.startsWith("del_ch_")) {
          const channelId = parseInt(data.replace("del_ch_", ""));
          const { data: ch } = await sb.from("telegram_channels").select(
            "id, channel_name",
          ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
            "channel_id",
            channelId,
          ).maybeSingle();
          if (ch) {
            await Promise.all([
              sb.from("subscriber_channels").delete().eq("channel_id", ch.id),
              sb.from("telegram_channels").delete().eq("id", ch.id),
            ]);
          }
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ تم حذف *${ch?.channel_name || channelId}*`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(isModerator),
          });
          logBotActivity({
            botTokenId, ownerId, actorTelegramId: cbFromId, isModerator,
            action: "channel_deleted",
            targetLabel: ch?.channel_name || String(channelId),
            details: { telegram_channel_id: channelId },
          });
        }
        if (data.startsWith("del_sub_")) {
          const userId = parseInt(data.replace("del_sub_", ""));
          const { data: sub } = await sb.from("telegram_subscribers").select(
            "id",
          ).eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq(
            "telegram_user_id",
            userId,
          ).maybeSingle();

          const channelsToKick = await getKickChannels(
            sub?.id || null,
            ownerId,
            botTokenId,
          );
          const kicked = await kickFromChannels(
            botToken,
            userId,
            channelsToKick,
          );

          await sb.from("telegram_subscribers").delete().eq("owner_id", ownerId)
            .eq("bot_token_id", botTokenId).eq("telegram_user_id", userId);

          await Promise.all([
            tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: `✅ *تم حذف* \`${userId}\` — طُرد من *${kicked}* قناة`,
              parse_mode: "Markdown",
              reply_markup: adminKeyboard(isModerator),
            }),
            tg(botToken, "sendMessage", {
              chat_id: userId,
              text: "⚠️ تم إلغاء اشتراكك وإزالتك من القنوات.",
            }),
          ]);
          logBotActivity({
            botTokenId, ownerId, actorTelegramId: cbFromId, isModerator,
            action: "subscriber_deleted",
            targetLabel: String(userId),
            targetTelegramId: userId,
            details: { kicked_channels: kicked },
          });
        }
        break;
      }
    }
  }
}

// ─── MAIN SERVER ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const tokenFromPath = pathParts[pathParts.length - 1];

    if (req.method === "POST" && tokenFromPath && tokenFromPath.includes(":")) {
      const settings = await getBotSettingsByToken(tokenFromPath);
      if (!settings) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: ownerProfile } = await sb
        .from("profiles")
        .select("is_approved, approved_until")
        .eq("id", settings.user_id)
        .maybeSingle();

      const isOwnerActive = ownerProfile?.is_approved &&
        (!ownerProfile.approved_until ||
          new Date(ownerProfile.approved_until) > new Date());

      if (!isOwnerActive) {
        return new Response(
          JSON.stringify({ ok: true, message: "Account deactivated" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const update = await req.json();
      await handleUpdate(
        update,
        tokenFromPath,
        settings.user_id,
        settings.id,
        settings.admin_telegram_id,
        settings.non_subscriber_message,
        settings.public_channel_id,
        settings.subscribers_channel_id,
        settings.free_trial_enabled ?? false,
        settings.free_trial_days ?? 3,
        settings.mandatory_chat_id ? Number(settings.mandatory_chat_id) : null,
        settings.free_trial_channel_ids ?? [],
      );
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { action, bot_token } = body;

      if (action === "setup_webhook") {
        const webhookUrl =
          `${supabaseUrl}/functions/v1/telegram-bot/${bot_token}`;
        const result = await tg(bot_token, "setWebhook", {
          url: webhookUrl,
          allowed_updates: [
            "message",
            "callback_query",
            "chat_join_request",
            "chat_member",
            "channel_post",
            "edited_channel_post",
          ],
        });
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "check_expiry") {
        const { data: allTokens } = await sb.from("bot_tokens").select("*");
        if (allTokens) {
          for (const tokenRow of allTokens) {
            const now = new Date();
            // Parallel: fetch expired + soon-expiring
            const [expiredRes, soonRes] = await Promise.all([
              sb.from("telegram_subscribers").select("*").eq(
                "owner_id",
                tokenRow.user_id,
              ).eq("bot_token_id", tokenRow.id).eq("is_permanent", false).eq(
                "expiry_notified",
                false,
              ).lt("expires_at", now.toISOString()),
              sb.from("telegram_subscribers").select("*").eq(
                "owner_id",
                tokenRow.user_id,
              ).eq("bot_token_id", tokenRow.id).eq("is_permanent", false).gt(
                "expires_at",
                now.toISOString(),
              ).lt(
                "expires_at",
                new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
              ),
            ]);

            const expiredSubs = expiredRes.data || [];
            const soonExpiring = soonRes.data || [];

            if (expiredSubs.length > 0) {
              // Batch get channels for all expired subs
              const subIds = expiredSubs.map((s: any) => s.id);
              const channelMap = await getSubscriberChannelsBatch(subIds);

              // Get all channels for this bot (fallback)
              const { data: allChannels } = await sb.from("telegram_channels")
                .select("channel_id").eq("owner_id", tokenRow.user_id).eq(
                  "bot_token_id",
                  tokenRow.id,
                );
              const allChannelIds = (allChannels || []).map((c: any) =>
                c.channel_id
              );

              // Process all expired subs in parallel
              await Promise.allSettled(expiredSubs.map(async (sub: any) => {
                const assignedIds = channelMap[sub.id] || [];
                let kickChannelIds: number[];
                if (assignedIds.length > 0) {
                  const { data } = await sb.from("telegram_channels").select(
                    "channel_id",
                  ).in("id", assignedIds);
                  kickChannelIds = (data || []).map((c: any) => c.channel_id);
                } else {
                  kickChannelIds = allChannelIds;
                }
                await kickFromChannels(
                  tokenRow.token,
                  sub.telegram_user_id,
                  kickChannelIds,
                );
                await tg(tokenRow.token, "sendMessage", {
                  chat_id: sub.telegram_user_id,
                  text: "⚠️ *انتهى اشتراكك*\n\nتم إزالتك من القنوات.",
                  parse_mode: "Markdown",
                });
                // Mark as notified so we don't send again
                await sb.from("telegram_subscribers").update({
                  expiry_notified: true,
                }).eq("id", sub.id);
              }));

              if (tokenRow.admin_telegram_id) {
                tgFire(tokenRow.token, "sendMessage", {
                  chat_id: tokenRow.admin_telegram_id,
                  text: `🔔 تم إزالة *${expiredSubs.length}* مشترك منتهي.`,
                  parse_mode: "Markdown",
                });
              }
            }

            // Warn soon-expiring in parallel
            if (soonExpiring.length > 0) {
              await Promise.allSettled(soonExpiring.map(async (sub: any) => {
                const hours = Math.ceil(
                  (new Date(sub.expires_at!).getTime() - now.getTime()) /
                    3600000,
                );
                await tg(tokenRow.token, "sendMessage", {
                  chat_id: sub.telegram_user_id,
                  text:
                    `⏳ *تنبيه:* اشتراكك سينتهي خلال *${hours}* ساعة تقريباً.\n\nتواصل مع المسؤول لتجديد اشتراكك قبل أن تتم إزالتك من القنوات.`,
                  parse_mode: "Markdown",
                });
              }));
            }
          }
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
