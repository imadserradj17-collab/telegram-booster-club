import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function supabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getBotSettingsByToken(token: string) {
  const { data } = await supabaseAdmin()
    .from("bot_tokens")
    .select("id, user_id, admin_telegram_id, non_subscriber_message")
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

// Get user profile photo URL
async function getUserPhotoUrl(token: string, userId: number): Promise<string | null> {
  try {
    const photos = await tg(token, "getUserProfilePhotos", { user_id: userId, limit: 1 });
    if (!photos.ok || !photos.result?.photos?.length) return null;
    const fileId = photos.result.photos[0][photos.result.photos[0].length - 1].file_id;
    const file = await tg(token, "getFile", { file_id: fileId });
    if (!file.ok) return null;
    return `https://api.telegram.org/file/bot${token}/${file.result.file_path}`;
  } catch { return null; }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function daysRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

// ─── STATE MANAGEMENT (Database-backed) ───
async function setState(chatId: number, botTokenId: string, state: string, data?: any) {
  const sb = supabaseAdmin();
  await sb.from("bot_pending_states").upsert(
    { chat_id: chatId, bot_token_id: botTokenId, state, data: data || {} },
    { onConflict: "chat_id,bot_token_id" }
  );
}

async function getState(chatId: number, botTokenId: string) {
  const sb = supabaseAdmin();
  // Clean up expired states (older than 5 minutes)
  await sb.from("bot_pending_states")
    .delete()
    .lt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

  const { data } = await sb.from("bot_pending_states")
    .select("state, data")
    .eq("chat_id", chatId)
    .eq("bot_token_id", botTokenId)
    .maybeSingle();
  return data ? { state: data.state, data: data.data } : null;
}

async function clearState(chatId: number, botTokenId: string) {
  const sb = supabaseAdmin();
  await sb.from("bot_pending_states")
    .delete()
    .eq("chat_id", chatId)
    .eq("bot_token_id", botTokenId);
}

// Get subscriber's assigned channels
async function getSubscriberChannels(sb: any, subscriberId: string) {
  const { data } = await sb.from("subscriber_channels")
    .select("channel_id")
    .eq("subscriber_id", subscriberId);
  return (data || []).map((r: any) => r.channel_id);
}

// Main admin keyboard
function adminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "➕ إضافة مشترك", callback_data: "add_subscriber" },
        { text: "📋 المشتركين", callback_data: "list_subscribers" },
      ],
      [
        { text: "➕ إضافة قناة", callback_data: "add_channel" },
        { text: "📺 القنوات", callback_data: "manage_channels" },
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

// Helper: finalize adding subscriber after channel selection
async function finalizeSubscriber(
  sb: any, botToken: string, chatId: number, ownerId: string, botTokenId: string,
  telegramUserId: number, telegramUsername: string | null, fn: string | null, ln: string | null,
  days: number | null, isPermanent: boolean, selectedChannelIds: string[]
) {
  const expiresAt = isPermanent ? null : new Date(Date.now() + days! * 86400000).toISOString();
  const photoUrl = await getUserPhotoUrl(botToken, telegramUserId);

  const { data: upsertedSub, error } = await sb.from("telegram_subscribers").upsert(
    { owner_id: ownerId, bot_token_id: botTokenId, telegram_user_id: telegramUserId, telegram_username: telegramUsername, first_name: fn || null, last_name: ln || null, photo_url: photoUrl, subscription_days: days, expires_at: expiresAt, is_permanent: isPermanent },
    { onConflict: "owner_id,telegram_user_id" }
  ).select("id").single();

  if (error) {
    await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ خطأ: " + error.message, reply_markup: adminKeyboard() });
    return;
  }

  const subscriberId = upsertedSub.id;

  // Clear old channel assignments and insert new ones
  await sb.from("subscriber_channels").delete().eq("subscriber_id", subscriberId);
  if (selectedChannelIds.length > 0) {
    const rows = selectedChannelIds.map((chId: string) => ({ subscriber_id: subscriberId, channel_id: chId }));
    await sb.from("subscriber_channels").insert(rows);
  }

  // Get the selected channels info to send invite links
  const { data: selectedChannels } = await sb.from("telegram_channels")
    .select("channel_name, invite_link")
    .in("id", selectedChannelIds);

  const buttons = (selectedChannels || []).filter((ch: any) => ch.invite_link).map((ch: any) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);

  if (buttons.length > 0) {
    await tg(botToken, "sendMessage", {
      chat_id: telegramUserId,
      text: "🎉 *تم تفعيل اشتراكك!*\n\nاضغط على الأزرار للانضمام:",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  }

  const subInfo = isPermanent ? "♾ دائم" : `📅 ${days} يوم (حتى ${formatDate(expiresAt!)})`;
  await tg(botToken, "sendMessage", {
    chat_id: chatId,
    text: `✅ *تمت إضافة المشترك بنجاح!*\n\n🆔 المعرف: \`${telegramUserId}\`\n${subInfo}\n📺 القنوات: *${selectedChannelIds.length}*${buttons.length > 0 ? `\n✉️ تم إرسال ${buttons.length} رابط للمشترك` : ""}`,
    parse_mode: "Markdown",
    reply_markup: adminKeyboard(),
  });
}

async function handleUpdate(update: any, botToken: string, ownerId: string, botTokenId: string, adminTelegramId: number | null, nonSubMessage: string) {
  const sb = supabaseAdmin();

  // ─── CHAT JOIN REQUESTS ───
  if (update.chat_join_request) {
    const req = update.chat_join_request;
    const telegramUserId = req.from.id;
    const chatId = req.chat.id;
    const firstName = req.from.first_name || "";

    // Only process if this channel belongs to THIS bot
    const { data: myChannel } = await sb
      .from("telegram_channels")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("bot_token_id", botTokenId)
      .eq("channel_id", chatId)
      .maybeSingle();

    if (!myChannel) return;

    const { data: sub } = await sb
      .from("telegram_subscribers")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("bot_token_id", botTokenId)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (sub) {
      if (!sub.is_permanent && sub.expires_at && new Date(sub.expires_at) < new Date()) {
        await tg(botToken, "declineChatJoinRequest", { chat_id: chatId, user_id: telegramUserId });
        await tg(botToken, "sendMessage", {
          chat_id: telegramUserId,
          text: "⏰ *انتهى اشتراكك!*\n\nتواصل مع المسؤول لتجديد الاشتراك.",
          parse_mode: "Markdown",
        });
      } else {
        // Check if subscriber has access to THIS specific channel
        const assignedChannelIds = await getSubscriberChannels(sb, sub.id);
        const hasAccess = assignedChannelIds.length === 0 || assignedChannelIds.includes(myChannel.id);

        if (!hasAccess) {
          await tg(botToken, "declineChatJoinRequest", { chat_id: chatId, user_id: telegramUserId });
          await tg(botToken, "sendMessage", {
            chat_id: telegramUserId,
            text: "⛔ *ليس لديك صلاحية لهذه القناة.*\n\nاشتراكك لا يشمل هذه القناة. تواصل مع المسؤول.",
            parse_mode: "Markdown",
          });
          return;
        }

        await tg(botToken, "approveChatJoinRequest", { chat_id: chatId, user_id: telegramUserId });
        await tg(botToken, "sendMessage", {
          chat_id: telegramUserId,
          text: `✅ تم قبولك في القناة *${req.chat.title || ""}*! مرحباً بك 🎉`,
          parse_mode: "Markdown",
        });
        // Update user info on join
        const updateData: any = {};
        if (req.from.username) updateData.telegram_username = req.from.username;
        if (req.from.first_name) updateData.first_name = req.from.first_name;
        if (req.from.last_name) updateData.last_name = req.from.last_name;
        if (Object.keys(updateData).length > 0) {
          const photoUrl = await getUserPhotoUrl(botToken, telegramUserId);
          if (photoUrl) updateData.photo_url = photoUrl;
          await sb.from("telegram_subscribers")
            .update(updateData)
            .eq("owner_id", ownerId)
            .eq("bot_token_id", botTokenId)
            .eq("telegram_user_id", telegramUserId);
        }
        if (adminTelegramId) {
          await tg(botToken, "sendMessage", {
            chat_id: adminTelegramId,
            text: `📥 *طلب انضمام مقبول*\n\n👤 ${firstName} (\`${telegramUserId}\`)\n📺 ${req.chat.title || chatId}`,
            parse_mode: "Markdown",
          });
        }
      }
    } else {
      await tg(botToken, "declineChatJoinRequest", { chat_id: chatId, user_id: telegramUserId });
      await tg(botToken, "sendMessage", { chat_id: telegramUserId, text: nonSubMessage });
      if (adminTelegramId) {
        await tg(botToken, "sendMessage", {
          chat_id: adminTelegramId,
          text: `🚫 *طلب انضمام مرفوض*\n\n👤 ${firstName} (\`${telegramUserId}\`) — غير مشترك\n📺 ${req.chat.title || chatId}`,
          parse_mode: "Markdown",
        });
      }
    }
    return;
  }

  // ─── MESSAGES ───
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text || "";
    const fromId = msg.from.id;
    const firstName = msg.from.first_name || "";
    const isAdmin = !adminTelegramId || fromId === adminTelegramId;

    // /start command
    if (text === "/start") {
      await clearState(chatId, botToken);
      if (isAdmin) {
        const { data: subs } = await sb.from("telegram_subscribers").select("id, is_permanent, expires_at").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        const { data: channels } = await sb.from("telegram_channels").select("id").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        const total = subs?.length || 0;
        const active = subs?.filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date())).length || 0;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `🤖 *لوحة تحكم بوت الاشتراكات*\n\nمرحباً بك يا *${firstName}*! 👋\n\n📊 نظرة سريعة:\n├ 👥 المشتركين: *${active}* نشط من أصل *${total}*\n└ 📺 القنوات: *${channels?.length || 0}*\n\nاختر أحد الخيارات:`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
      } else {
        const { data: sub } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", fromId).maybeSingle();

        if (sub && (sub.is_permanent || (sub.expires_at && new Date(sub.expires_at) > new Date()))) {
          // Get only the subscriber's assigned channels
          const assignedChannelIds = await getSubscriberChannels(sb, sub.id);
          
          let channels: any[];
          if (assignedChannelIds.length > 0) {
            const { data } = await sb.from("telegram_channels")
              .select("channel_name, invite_link")
              .in("id", assignedChannelIds);
            channels = data || [];
          } else {
            // Legacy: no channel assignments = access to all channels
            const { data } = await sb.from("telegram_channels")
              .select("channel_name, invite_link")
              .eq("owner_id", ownerId)
              .eq("bot_token_id", botTokenId);
            channels = data || [];
          }

          const subStatus = sub.is_permanent ? "♾ *دائم*" : `📅 متبقي *${daysRemaining(sub.expires_at!)}* يوم (حتى ${formatDate(sub.expires_at!)})`;
          const buttons = channels.filter((ch: any) => ch.invite_link).map((ch: any) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);
          buttons.push([{ text: "ℹ️ حالة اشتراكي", callback_data: "my_subscription" }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `مرحباً *${firstName}*! 👋\n\n✅ أنت مشترك\n${subStatus}\n\n📺 اضغط على القنوات للانضمام:`,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: buttons },
          });
        } else if (sub) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `⏰ مرحباً *${firstName}*\n\nللأسف اشتراكك *منتهي* منذ ${formatDate(sub.expires_at!)}.\n\nتواصل مع المسؤول لتجديد اشتراكك.`,
            parse_mode: "Markdown",
          });
        } else {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: nonSubMessage });
        }
      }
      return;
    }

    // /id command
    if (text === "/id" || text === "/myid") {
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🆔 معرفك: \`${fromId}\`\n👤 الاسم: ${firstName}${msg.from.username ? `\n📛 المعرف: @${msg.from.username}` : ""}`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /cancel command
    if (text === "/cancel" || text === "إلغاء") {
      await clearState(chatId, botToken);
      if (isAdmin) {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "❌ تم الإلغاء.",
          reply_markup: adminKeyboard(),
        });
      }
      return;
    }

    // Non-admin
    if (!isAdmin) {
      if (text === "/status" || text === "/حالتي") {
        const { data: sub } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", fromId).maybeSingle();
        if (sub) {
          const status = sub.is_permanent
            ? "♾ *دائم* — لا ينتهي"
            : sub.expires_at && new Date(sub.expires_at) > new Date()
            ? `✅ *نشط* — متبقي *${daysRemaining(sub.expires_at!)}* يوم\n📅 ينتهي: ${formatDate(sub.expires_at!)}`
            : `❌ *منتهي* منذ ${formatDate(sub.expires_at!)}`;
          await tg(botToken, "sendMessage", { chat_id: chatId, text: `📋 *حالة اشتراكك:*\n\n${status}`, parse_mode: "Markdown" });
        } else {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: nonSubMessage });
        }
        return;
      }
      await tg(botToken, "sendMessage", { chat_id: chatId, text: nonSubMessage });
      return;
    }

    // ─── ADMIN STATE HANDLING ───
    const currentState = await getState(chatId, botToken);

    if (currentState) {
      switch (currentState.state) {
        // ── ADD SUBSCRIBER STEP 1: waiting for user ID ──
        case "await_sub_id": {
          let telegramUserId: number | null = null;
          let telegramUsername: string | null = null;
          let userFirstName: string | null = null;
          let userLastName: string | null = null;

          // Support both old (forward_from) and new (forward_origin) Telegram API
          if (msg.forward_from) {
            telegramUserId = msg.forward_from.id;
            telegramUsername = msg.forward_from.username || null;
            userFirstName = msg.forward_from.first_name || null;
            userLastName = msg.forward_from.last_name || null;
          } else if (msg.forward_origin) {
            if (msg.forward_origin.type === "user" && msg.forward_origin.sender_user) {
              telegramUserId = msg.forward_origin.sender_user.id;
              telegramUsername = msg.forward_origin.sender_user.username || null;
              userFirstName = msg.forward_origin.sender_user.first_name || null;
              userLastName = msg.forward_origin.sender_user.last_name || null;
            } else if (msg.forward_origin.type === "hidden_user") {
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text: "❌ هذا المستخدم أخفى معلوماته.\n\n💡 اطلب منه إرسال /id للبوت، أو أرسل الـ ID الرقمي مباشرة.",
                parse_mode: "Markdown",
              });
              return;
            }
          } else if (msg.forward_sender_name) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ هذا المستخدم أخفى معلوماته.\n\n💡 اطلب منه إرسال /id للبوت، أو أرسل الـ ID الرقمي مباشرة.",
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
                text: `⚠️ لا يمكن تحويل *@${input}* إلى ID مباشرة.\n\n💡 اطلب منه إرسال /id للبوت ثم أرسل لي الرقم.`,
                parse_mode: "Markdown",
              });
              return;
            } else {
              await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ مدخل غير صالح. أرسل الـ ID أو حوّل رسالة." });
              return;
            }
          }

          // Check existing
          const { data: existing } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", telegramUserId).maybeSingle();
          let existingInfo = "";
          if (existing) {
            const status = existing.is_permanent ? "♾ دائم" : existing.expires_at && new Date(existing.expires_at) > new Date() ? `✅ نشط (${daysRemaining(existing.expires_at)} يوم)` : "❌ منتهي";
            existingInfo = `\n\n⚠️ *مشترك حالياً:* ${status}\nسيتم تحديث الاشتراك.`;
          }

          await setState(chatId, botToken, "await_sub_days", { telegramUserId, telegramUsername, userFirstName, userLastName });

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ المعرف: \`${telegramUserId}\`${telegramUsername ? ` (@${telegramUsername})` : ""}${existingInfo}\n\n📅 اختر مدة الاشتراك:`,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "7 أيام", callback_data: "days_7" },
                  { text: "15 يوم", callback_data: "days_15" },
                  { text: "30 يوم", callback_data: "days_30" },
                ],
                [
                  { text: "60 يوم", callback_data: "days_60" },
                  { text: "90 يوم", callback_data: "days_90" },
                  { text: "180 يوم", callback_data: "days_180" },
                ],
                [
                  { text: "365 يوم", callback_data: "days_365" },
                  { text: "♾ دائم", callback_data: "days_permanent" },
                ],
                [{ text: "✏️ إدخال يدوي", callback_data: "days_custom" }],
                [{ text: "❌ إلغاء", callback_data: "cancel_action" }],
              ],
            },
          });
          return;
        }

        // ── ADD SUBSCRIBER STEP 2: waiting for days (text input) ──
        case "await_sub_days": {
          const { telegramUserId, telegramUsername, userFirstName: fn, userLastName: ln } = currentState.data;
          const isPermanent = text.trim() === "دائم";
          const days = isPermanent ? null : parseInt(text.trim());

          if (!isPermanent && (isNaN(days!) || days! <= 0)) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ أدخل رقماً صحيحاً (مثال: 30) أو اكتب *دائم*\n\n_أرسل /cancel للإلغاء_",
              parse_mode: "Markdown",
            });
            return;
          }

          // Move to channel selection step
          const { data: channels } = await sb.from("telegram_channels").select("id, channel_name").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
          
          if (!channels || channels.length === 0) {
            // No channels — finalize directly with empty channel list
            await clearState(chatId, botToken);
            await finalizeSubscriber(sb, botToken, chatId, ownerId, botTokenId, telegramUserId, telegramUsername, fn, ln, days, isPermanent, []);
            return;
          }

          if (channels.length === 1) {
            // Only one channel — auto-select it
            await clearState(chatId, botToken);
            await finalizeSubscriber(sb, botToken, chatId, ownerId, botTokenId, telegramUserId, telegramUsername, fn, ln, days, isPermanent, [channels[0].id]);
            return;
          }

          // Multiple channels — show selection
          await setState(chatId, botToken, "await_sub_channels", {
            telegramUserId, telegramUsername, userFirstName: fn, userLastName: ln,
            days, isPermanent, selectedChannels: []
          });

          const channelButtons = channels.map((ch: any) => [{ text: `⬜ ${ch.channel_name}`, callback_data: `toggle_ch_${ch.id}` }]);
          channelButtons.push([{ text: "✅ الكل", callback_data: "select_all_channels" }]);
          channelButtons.push([{ text: "📥 تأكيد الاختيار", callback_data: "confirm_channels" }]);
          channelButtons.push([{ text: "❌ إلغاء", callback_data: "cancel_action" }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "📺 *اختر القنوات للمشترك:*\n\nاضغط على القناة لتحديدها/إلغاء تحديدها، ثم اضغط تأكيد.",
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: channelButtons },
          });
          return;
        }

        // ── ADD CHANNEL ──
        case "await_channel": {
          let channelId: number | null = null;

          // Support both old (forward_from_chat) and new (forward_origin) Telegram API
          if (msg.forward_from_chat) {
            channelId = msg.forward_from_chat.id;
          } else if (msg.forward_origin && (msg.forward_origin.type === "channel" || msg.forward_origin.type === "chat") && msg.forward_origin.sender_chat) {
            channelId = msg.forward_origin.sender_chat.id;
          } else {
            const input = text.trim().replace(/^@/, "");
            const parsed = parseInt(input);
            if (!isNaN(parsed)) {
              channelId = parsed;
            } else if (input.length > 0) {
              const resolved = await tg(botToken, "getChat", { chat_id: `@${input}` });
              if (resolved.ok) {
                channelId = resolved.result.id;
              } else {
                await tg(botToken, "sendMessage", {
                  chat_id: chatId,
                  text: `❌ لم يتم العثور على *@${input}*\n\n💡 تأكد أن البوت مسؤول فيها.`,
                  parse_mode: "Markdown",
                });
                return;
              }
            } else {
              await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ مدخل غير صالح." });
              return;
            }
          }

          await clearState(chatId, botToken);

          const chatInfo = await tg(botToken, "getChat", { chat_id: channelId });
          const channelName = chatInfo.ok ? chatInfo.result.title || `قناة ${channelId}` : `قناة ${channelId}`;

          if (chatInfo.ok) {
            const botMe = await tg(botToken, "getMe", {});
            const memberInfo = await tg(botToken, "getChatMember", { chat_id: channelId, user_id: botMe.result.id });
            if (!memberInfo.ok || !["administrator", "creator"].includes(memberInfo.result?.status)) {
              await tg(botToken, "sendMessage", {
                chat_id: chatId,
                text: `⚠️ البوت *ليس مسؤولاً* في *${channelName}*\n\nأضف البوت كمسؤول أولاً.`,
                parse_mode: "Markdown",
                reply_markup: adminKeyboard(),
              });
              return;
            }
          }

          const linkRes = await tg(botToken, "createChatInviteLink", { chat_id: channelId, creates_join_request: true, name: `bot_invite_${channelId}` });
          if (!linkRes.ok) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: `❌ فشل إنشاء رابط الدعوة\n\n💡 تأكد أن البوت لديه صلاحية *دعوة أعضاء*.`,
              parse_mode: "Markdown",
              reply_markup: adminKeyboard(),
            });
            return;
          }

          const { error } = await sb.from("telegram_channels").upsert(
            { owner_id: ownerId, bot_token_id: botTokenId, channel_id: channelId, channel_name: channelName, invite_link: linkRes.result.invite_link },
            { onConflict: "owner_id,channel_id" }
          );

          if (error) {
            await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ خطأ: " + error.message, reply_markup: adminKeyboard() });
            return;
          }

          const membersRes = await tg(botToken, "getChatMemberCount", { chat_id: channelId });
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ *تمت إضافة القناة!*\n\n📺 *${channelName}*\n🆔 \`${channelId}\`\n👥 الأعضاء: ${membersRes.ok ? membersRes.result : "—"}\n🔗 [رابط الدعوة](${linkRes.result.invite_link})`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
          return;
        }

        // ── BROADCAST ──
        case "await_broadcast": {
          await clearState(chatId, botToken);
          const { data: subs } = await sb.from("telegram_subscribers").select("telegram_user_id, is_permanent, expires_at").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
          const activeSubs = (subs || []).filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date()));

          let sent = 0, failed = 0;
          for (const sub of activeSubs) {
            try {
              if (msg.photo || msg.video || msg.document || msg.animation) {
                await tg(botToken, "copyMessage", { chat_id: sub.telegram_user_id, from_chat_id: chatId, message_id: msg.message_id });
              } else if (msg.forward_from_chat || msg.forward_from) {
                await tg(botToken, "forwardMessage", { chat_id: sub.telegram_user_id, from_chat_id: chatId, message_id: msg.message_id });
              } else {
                await tg(botToken, "sendMessage", { chat_id: sub.telegram_user_id, text });
              }
              sent++;
            } catch { failed++; }
          }

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `📢 *تم الإرسال!*\n\n✅ نجح: *${sent}*\n❌ فشل: *${failed}*\n📊 الإجمالي: ${activeSubs.length}`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
          return;
        }

        // ── SEARCH SUBSCRIBER ──
        case "await_search": {
          await clearState(chatId, botToken);
          const input = text.trim().replace(/^@/, "");
          const parsed = parseInt(input);

          let sub: any = null;
          if (!isNaN(parsed)) {
            const { data } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", parsed).maybeSingle();
            sub = data;
          } else if (input.length > 0) {
            const { data } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).ilike("telegram_username", `%${input}%`).maybeSingle();
            sub = data;
          }

          if (sub) {
            // Get assigned channels for this subscriber
            const assignedChannelIds = await getSubscriberChannels(sb, sub.id);
            let channelInfo = "";
            if (assignedChannelIds.length > 0) {
              const { data: chNames } = await sb.from("telegram_channels").select("channel_name").in("id", assignedChannelIds);
              channelInfo = `\n📺 القنوات: ${(chNames || []).map((c: any) => c.channel_name).join("، ")}`;
            } else {
              channelInfo = "\n📺 القنوات: جميع القنوات";
            }

            const status = sub.is_permanent ? "♾ دائم" : sub.expires_at && new Date(sub.expires_at) > new Date() ? `✅ نشط (${daysRemaining(sub.expires_at)} يوم)\n📅 ينتهي: ${formatDate(sub.expires_at)}` : `❌ منتهي منذ ${formatDate(sub.expires_at)}`;
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: `🔍 *نتيجة البحث:*\n\n🆔 \`${sub.telegram_user_id}\`\n${sub.telegram_username ? `📛 @${sub.telegram_username}\n` : ""}📋 ${status}${channelInfo}\n📅 أضيف: ${formatDate(sub.created_at)}`,
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [[{ text: "🗑 حذف", callback_data: `del_sub_${sub.telegram_user_id}` }], [{ text: "🔙 رجوع", callback_data: "back" }]] },
            });
          } else {
            await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ لم يتم العثور على مشترك.", reply_markup: adminKeyboard() });
          }
          return;
        }

        // ── DELETE SUBSCRIBER ──
        case "await_delete_sub": {
          await clearState(chatId, botToken);
          const parsed = parseInt(text.trim());
          if (isNaN(parsed)) {
            await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ أرسل رقم ID فقط.", reply_markup: adminKeyboard() });
            return;
          }

          const { data: sub } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", parsed).maybeSingle();
          if (!sub) {
            await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ المشترك غير موجود.", reply_markup: adminKeyboard() });
            return;
          }

          // Get channels to kick from (only assigned channels, or all if none assigned)
          const assignedChannelIds = await getSubscriberChannels(sb, sub.id);
          let channelsToKick: any[];
          if (assignedChannelIds.length > 0) {
            const { data } = await sb.from("telegram_channels").select("channel_id").in("id", assignedChannelIds);
            channelsToKick = data || [];
          } else {
            const { data } = await sb.from("telegram_channels").select("channel_id").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
            channelsToKick = data || [];
          }

          let kicked = 0;
          for (const ch of channelsToKick) {
            const res = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: parsed });
            if (res.ok) { await tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: parsed, only_if_banned: true }); kicked++; }
          }
          // subscriber_channels will be auto-deleted via CASCADE
          await sb.from("telegram_subscribers").delete().eq("id", sub.id);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ *تم حذف المشترك* \`${parsed}\`\n🚫 طُرد من *${kicked}* قناة`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
          await tg(botToken, "sendMessage", { chat_id: parsed, text: "⚠️ تم إلغاء اشتراكك وإزالتك من القنوات." });
          return;
        }

        // ── AWAITING CHANNEL SELECTION (no text input expected here) ──
        case "await_sub_channels": {
          // Ignore text messages in this state, buttons handle it
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "💡 اضغط على الأزرار لاختيار القنوات ثم اضغط *تأكيد الاختيار*.",
            parse_mode: "Markdown",
          });
          return;
        }
      }
    }

    // No state and not a command — ignore
    return;
  }

  // ─── CALLBACK QUERIES ───
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const cbFromId = cb.from.id;
    const data = cb.data;

    if (data === "my_subscription") {
      const { data: sub } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", cbFromId).maybeSingle();
      await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id });
      if (sub) {
        // Show assigned channels
        const assignedChannelIds = await getSubscriberChannels(sb, sub.id);
        let channelInfo = "";
        if (assignedChannelIds.length > 0) {
          const { data: chNames } = await sb.from("telegram_channels").select("channel_name").in("id", assignedChannelIds);
          channelInfo = `\n📺 القنوات: ${(chNames || []).map((c: any) => c.channel_name).join("، ")}`;
        }

        const status = sub.is_permanent ? "♾ *دائم*" : sub.expires_at && new Date(sub.expires_at) > new Date() ? `✅ *نشط*\n📅 ينتهي: ${formatDate(sub.expires_at)}\n⏳ متبقي: *${daysRemaining(sub.expires_at)}* يوم` : `❌ *منتهي* منذ ${formatDate(sub.expires_at!)}`;
        await tg(botToken, "sendMessage", { chat_id: chatId, text: `📋 *اشتراكك:*\n\n${status}${channelInfo}\n📅 تاريخ الاشتراك: ${formatDate(sub.created_at)}`, parse_mode: "Markdown" });
      }
      return;
    }

    const isCbAdmin = !adminTelegramId || cbFromId === adminTelegramId;
    if (!isCbAdmin) {
      await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "⛔ غير مصرح لك" });
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
      if (idx >= 0) {
        selected.splice(idx, 1);
      } else {
        selected.push(channelUuid);
      }

      await setState(chatId, botToken, "await_sub_channels", { ...currentSt.data, selectedChannels: selected });

      // Update the buttons to reflect selection
      const { data: channels } = await sb.from("telegram_channels").select("id, channel_name").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
      const channelButtons = (channels || []).map((ch: any) => {
        const isSelected = selected.includes(ch.id);
        return [{ text: `${isSelected ? "✅" : "⬜"} ${ch.channel_name}`, callback_data: `toggle_ch_${ch.id}` }];
      });
      channelButtons.push([{ text: "✅ الكل", callback_data: "select_all_channels" }]);
      channelButtons.push([{ text: `📥 تأكيد الاختيار (${selected.length})`, callback_data: "confirm_channels" }]);
      channelButtons.push([{ text: "❌ إلغاء", callback_data: "cancel_action" }]);

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

      const { data: channels } = await sb.from("telegram_channels").select("id, channel_name").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
      const allIds = (channels || []).map((ch: any) => ch.id);

      await setState(chatId, botToken, "await_sub_channels", { ...currentSt.data, selectedChannels: allIds });

      const channelButtons = (channels || []).map((ch: any) => [{ text: `✅ ${ch.channel_name}`, callback_data: `toggle_ch_${ch.id}` }]);
      channelButtons.push([{ text: "✅ الكل", callback_data: "select_all_channels" }]);
      channelButtons.push([{ text: `📥 تأكيد الاختيار (${allIds.length})`, callback_data: "confirm_channels" }]);
      channelButtons.push([{ text: "❌ إلغاء", callback_data: "cancel_action" }]);

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

      const { telegramUserId, telegramUsername, userFirstName: fn, userLastName: ln, days, isPermanent, selectedChannels } = currentSt.data;

      if (!selectedChannels || selectedChannels.length === 0) {
        await tg(botToken, "sendMessage", { chat_id: chatId, text: "⚠️ يجب اختيار قناة واحدة على الأقل!" });
        return;
      }

      await clearState(chatId, botToken);
      await finalizeSubscriber(sb, botToken, chatId, ownerId, botTokenId, telegramUserId, telegramUsername, fn, ln, days, isPermanent, selectedChannels);
      return;
    }

    switch (data) {
      case "add_subscriber": {
        await setState(chatId, botToken, "await_sub_id");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "👤 *إضافة مشترك*\n\nأرسل معرف المستخدم بإحدى الطرق:\n\n1️⃣ الـ Telegram ID (رقم)\n2️⃣ حوّل (Forward) رسالة منه\n\n💡 يمكنه معرفة ID بإرسال /id للبوت\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "list_subscribers": {
        await clearState(chatId, botToken);
        const { data: subs } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).order("created_at", { ascending: false }).limit(20);
        if (!subs || subs.length === 0) {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: "📋 لا يوجد مشتركون حالياً.", reply_markup: adminKeyboard() });
        } else {
          let msgText = `📋 *المشتركون (${subs.length}):*\n\n`;
          for (const s of subs) {
            const st = s.is_permanent ? "♾" : s.expires_at && new Date(s.expires_at) > new Date() ? `✅ ${daysRemaining(s.expires_at)}ي` : "❌";
            // Show channel count
            const chIds = await getSubscriberChannels(sb, s.id);
            const chCount = chIds.length > 0 ? ` (📺${chIds.length})` : "";
            msgText += `${st} \`${s.telegram_user_id}\`${s.telegram_username ? ` @${s.telegram_username}` : ""}${chCount}\n`;
          }
          await tg(botToken, "sendMessage", { chat_id: chatId, text: msgText, parse_mode: "Markdown", reply_markup: adminKeyboard() });
        }
        break;
      }

      case "manage_channels": {
        await clearState(chatId, botToken);
        const { data: channels } = await sb.from("telegram_channels").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        if (!channels || channels.length === 0) {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: "📺 لا توجد قنوات.", reply_markup: adminKeyboard() });
        } else {
          let msgText = `📺 *القنوات (${channels.length}):*\n\n`;
          const buttons = [];
          for (const ch of channels) {
            msgText += `• *${ch.channel_name}*\n  🆔 \`${ch.channel_id}\`${ch.invite_link ? " — 🔗 رابط متاح" : ""}\n`;
            buttons.push([{ text: `🗑 حذف ${ch.channel_name}`, callback_data: `del_ch_${ch.channel_id}` }]);
          }
          buttons.push([{ text: "🔙 رجوع", callback_data: "back" }]);
          await tg(botToken, "sendMessage", { chat_id: chatId, text: msgText, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
        }
        break;
      }

      case "add_channel": {
        await setState(chatId, botToken, "await_channel");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "📺 *إضافة قناة*\n\nأرسل بإحدى الطرق:\n\n1️⃣ معرف القناة (رقم سالب)\n2️⃣ @username القناة\n3️⃣ حوّل رسالة من القناة\n\n⚠️ البوت يجب أن يكون مسؤولاً!\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "broadcast": {
        const { data: subs } = await sb.from("telegram_subscribers").select("is_permanent, expires_at").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        const active = (subs || []).filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date())).length;
        await setState(chatId, botToken, "await_broadcast");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📢 *رسالة جماعية*\n\nسيتم إرسالها لـ *${active}* مشترك نشط.\n\nأرسل الرسالة الآن (نص، صورة، فيديو...):\n\n_أرسل /cancel للإلغاء_`,
          parse_mode: "Markdown",
        });
        break;
      }

      case "search_subscriber": {
        await setState(chatId, botToken, "await_search");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "🔍 *بحث عن مشترك*\n\nأرسل الـ ID أو @username:\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "delete_subscriber": {
        await setState(chatId, botToken, "await_delete_sub");
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "🗑 *حذف مشترك*\n\nأرسل الـ ID الرقمي للمشترك:\n\n⚠️ سيتم طرده من القنوات نهائياً.\n\n_أرسل /cancel للإلغاء_",
          parse_mode: "Markdown",
        });
        break;
      }

      case "stats": {
        await clearState(chatId, botToken);
        const { data: subs } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        const { data: channels } = await sb.from("telegram_channels").select("*").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
        const total = subs?.length || 0;
        const active = subs?.filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date())).length || 0;
        const permanent = subs?.filter((s: any) => s.is_permanent).length || 0;
        const expiringSoon = subs?.filter((s: any) => !s.is_permanent && s.expires_at && new Date(s.expires_at) > new Date() && daysRemaining(s.expires_at) <= 3).length || 0;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📊 *الإحصائيات:*\n\n👥 *المشتركين:*\n├ إجمالي: *${total}*\n├ ✅ نشطون: *${active}*\n├ ♾ دائمون: *${permanent}*\n├ ❌ منتهيون: *${total - active}*\n└ ⚠️ ينتهي خلال 3 أيام: *${expiringSoon}*\n\n📺 *القنوات:* ${channels?.length || 0}`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
        break;
      }

      case "cancel_action": {
        await clearState(chatId, botToken);
        await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ تم الإلغاء.", reply_markup: adminKeyboard() });
        break;
      }

      case "back": {
        await clearState(chatId, botToken);
        await tg(botToken, "sendMessage", { chat_id: chatId, text: "🤖 *لوحة التحكم*", parse_mode: "Markdown", reply_markup: adminKeyboard() });
        break;
      }

      default: {
        // ── Days selection buttons ──
        if (data.startsWith("days_")) {
          const currentSt = await getState(chatId, botToken);
          if (!currentSt || currentSt.state !== "await_sub_days") {
            await tg(botToken, "sendMessage", { chat_id: chatId, text: "⚠️ انتهت صلاحية العملية. أعد المحاولة.", reply_markup: adminKeyboard() });
            break;
          }
          const { telegramUserId, telegramUsername, userFirstName: fn, userLastName: ln } = currentSt.data;
          const isPermanent = data === "days_permanent";
          const days = isPermanent ? null : parseInt(data.replace("days_", ""));

          // Move to channel selection step
          const { data: channels } = await sb.from("telegram_channels").select("id, channel_name").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);

          if (!channels || channels.length === 0) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(sb, botToken, chatId, ownerId, botTokenId, telegramUserId, telegramUsername, fn, ln, days, isPermanent, []);
            break;
          }

          if (channels.length === 1) {
            await clearState(chatId, botToken);
            await finalizeSubscriber(sb, botToken, chatId, ownerId, botTokenId, telegramUserId, telegramUsername, fn, ln, days, isPermanent, [channels[0].id]);
            break;
          }

          // Multiple channels — show channel selection
          await setState(chatId, botToken, "await_sub_channels", {
            telegramUserId, telegramUsername, userFirstName: fn, userLastName: ln,
            days, isPermanent, selectedChannels: []
          });

          const channelButtons = channels.map((ch: any) => [{ text: `⬜ ${ch.channel_name}`, callback_data: `toggle_ch_${ch.id}` }]);
          channelButtons.push([{ text: "✅ الكل", callback_data: "select_all_channels" }]);
          channelButtons.push([{ text: "📥 تأكيد الاختيار (0)", callback_data: "confirm_channels" }]);
          channelButtons.push([{ text: "❌ إلغاء", callback_data: "cancel_action" }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "📺 *اختر القنوات للمشترك:*\n\nاضغط على القناة لتحديدها/إلغاء تحديدها، ثم اضغط تأكيد.",
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: channelButtons },
          });
          break;
        }

        if (data.startsWith("del_ch_")) {
          const channelId = parseInt(data.replace("del_ch_", ""));
          const { data: ch } = await sb.from("telegram_channels").select("id, channel_name").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("channel_id", channelId).maybeSingle();
          if (ch) {
            // Also clean up subscriber_channels referencing this channel
            await sb.from("subscriber_channels").delete().eq("channel_id", ch.id);
            await sb.from("telegram_channels").delete().eq("id", ch.id);
          }
          await tg(botToken, "sendMessage", { chat_id: chatId, text: `✅ تم حذف *${ch?.channel_name || channelId}*`, parse_mode: "Markdown", reply_markup: adminKeyboard() });
        }
        if (data.startsWith("del_sub_")) {
          const userId = parseInt(data.replace("del_sub_", ""));
          const { data: sub } = await sb.from("telegram_subscribers").select("id").eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", userId).maybeSingle();
          
          // Get channels to kick from
          let channelsToKick: any[];
          if (sub) {
            const assignedChannelIds = await getSubscriberChannels(sb, sub.id);
            if (assignedChannelIds.length > 0) {
              const { data } = await sb.from("telegram_channels").select("channel_id").in("id", assignedChannelIds);
              channelsToKick = data || [];
            } else {
              const { data } = await sb.from("telegram_channels").select("channel_id").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
              channelsToKick = data || [];
            }
          } else {
            const { data } = await sb.from("telegram_channels").select("channel_id").eq("owner_id", ownerId).eq("bot_token_id", botTokenId);
            channelsToKick = data || [];
          }

          let kicked = 0;
          for (const ch of channelsToKick) {
            const res = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: userId });
            if (res.ok) { await tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: userId, only_if_banned: true }); kicked++; }
          }
          await sb.from("telegram_subscribers").delete().eq("owner_id", ownerId).eq("bot_token_id", botTokenId).eq("telegram_user_id", userId);
          await tg(botToken, "sendMessage", { chat_id: chatId, text: `✅ *تم حذف* \`${userId}\` — طُرد من *${kicked}* قناة`, parse_mode: "Markdown", reply_markup: adminKeyboard() });
          await tg(botToken, "sendMessage", { chat_id: userId, text: "⚠️ تم إلغاء اشتراكك وإزالتك من القنوات." });
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
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check if the bot owner's account is approved and not expired
      const { data: ownerProfile } = await supabaseAdmin()
        .from("profiles")
        .select("is_approved, approved_until")
        .eq("id", settings.user_id)
        .maybeSingle();

      const isOwnerActive = ownerProfile?.is_approved && 
        (!ownerProfile.approved_until || new Date(ownerProfile.approved_until) > new Date());

      if (!isOwnerActive) {
        return new Response(JSON.stringify({ ok: true, message: "Account deactivated" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const update = await req.json();
      await handleUpdate(update, tokenFromPath, settings.user_id, settings.id, settings.admin_telegram_id, settings.non_subscriber_message);
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { action, bot_token } = body;

      if (action === "setup_webhook") {
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot/${bot_token}`;
        const result = await tg(bot_token, "setWebhook", { url: webhookUrl, allowed_updates: ["message", "callback_query", "chat_join_request"] });
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "check_expiry") {
        const sb = supabaseAdmin();
        const { data: allTokens } = await sb.from("bot_tokens").select("*");
        if (allTokens) {
          for (const tokenRow of allTokens) {
            // 1. Kick expired subscribers from their assigned channels only
            const { data: expiredSubs } = await sb.from("telegram_subscribers").select("*").eq("owner_id", tokenRow.user_id).eq("bot_token_id", tokenRow.id).eq("is_permanent", false).lt("expires_at", new Date().toISOString());
            
            if (expiredSubs && expiredSubs.length > 0) {
              for (const sub of expiredSubs) {
                const assignedChannelIds = await getSubscriberChannels(sb, sub.id);
                let channelsToKick: any[];
                if (assignedChannelIds.length > 0) {
                  const { data } = await sb.from("telegram_channels").select("channel_id").in("id", assignedChannelIds);
                  channelsToKick = data || [];
                } else {
                  const { data } = await sb.from("telegram_channels").select("channel_id").eq("owner_id", tokenRow.user_id).eq("bot_token_id", tokenRow.id);
                  channelsToKick = data || [];
                }

                for (const ch of channelsToKick) {
                  await tg(tokenRow.token, "banChatMember", { chat_id: ch.channel_id, user_id: sub.telegram_user_id });
                  await tg(tokenRow.token, "unbanChatMember", { chat_id: ch.channel_id, user_id: sub.telegram_user_id, only_if_banned: true });
                }
                await tg(tokenRow.token, "sendMessage", { chat_id: sub.telegram_user_id, text: "⚠️ *انتهى اشتراكك*\n\nتم إزالتك من القنوات.", parse_mode: "Markdown" });
              }
              if (tokenRow.admin_telegram_id) {
                await tg(tokenRow.token, "sendMessage", { chat_id: tokenRow.admin_telegram_id, text: `🔔 تم إزالة *${expiredSubs.length}* مشترك منتهي.`, parse_mode: "Markdown" });
              }
            }

            // 2. Warn subscribers expiring within 24 hours
            const now = new Date();
            const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
            const { data: soonExpiring } = await sb.from("telegram_subscribers").select("*").eq("owner_id", tokenRow.user_id).eq("bot_token_id", tokenRow.id).eq("is_permanent", false).gt("expires_at", now.toISOString()).lt("expires_at", in24h);
            if (soonExpiring && soonExpiring.length > 0) {
              for (const sub of soonExpiring) {
                const hours = Math.ceil((new Date(sub.expires_at!).getTime() - now.getTime()) / 3600000);
                await tg(tokenRow.token, "sendMessage", {
                  chat_id: sub.telegram_user_id,
                  text: `⏳ *تنبيه:* اشتراكك سينتهي خلال *${hours}* ساعة تقريباً.\n\nتواصل مع المسؤول لتجديد اشتراكك قبل أن تتم إزالتك من القنوات.`,
                  parse_mode: "Markdown",
                });
              }
            }
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
