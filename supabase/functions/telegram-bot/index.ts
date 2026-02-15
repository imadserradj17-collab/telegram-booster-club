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

// Get bot settings by token value
async function getBotSettingsByToken(token: string) {
  const { data } = await supabaseAdmin()
    .from("bot_tokens")
    .select("user_id, admin_telegram_id, non_subscriber_message")
    .eq("token", token)
    .maybeSingle();
  return data || null;
}

// Telegram API call
async function tg(token: string, method: string, body?: any) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Format date nicely in Arabic
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

// Calculate remaining days
function daysRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
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

// Handle incoming updates
async function handleUpdate(update: any, botToken: string, ownerId: string, adminTelegramId: number | null, nonSubMessage: string) {
  const sb = supabaseAdmin();

  // ─── CHAT JOIN REQUESTS ───
  if (update.chat_join_request) {
    const req = update.chat_join_request;
    const telegramUserId = req.from.id;
    const chatId = req.chat.id;
    const firstName = req.from.first_name || "";

    const { data: sub } = await sb
      .from("telegram_subscribers")
      .select("*")
      .eq("owner_id", ownerId)
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
        await tg(botToken, "approveChatJoinRequest", { chat_id: chatId, user_id: telegramUserId });
        await tg(botToken, "sendMessage", {
          chat_id: telegramUserId,
          text: `✅ تم قبولك في القناة *${req.chat.title || ""}*! مرحباً بك 🎉`,
          parse_mode: "Markdown",
        });

        // Update username if changed
        if (req.from.username) {
          await sb.from("telegram_subscribers")
            .update({ telegram_username: req.from.username })
            .eq("owner_id", ownerId)
            .eq("telegram_user_id", telegramUserId);
        }

        // Notify admin
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

      // Notify admin
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
      if (isAdmin) {
        // Count stats for welcome
        const { data: subs } = await sb.from("telegram_subscribers").select("id, is_permanent, expires_at").eq("owner_id", ownerId);
        const { data: channels } = await sb.from("telegram_channels").select("id").eq("owner_id", ownerId);

        const total = subs?.length || 0;
        const active = subs?.filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date())).length || 0;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `🤖 *لوحة تحكم بوت الاشتراكات*\n\n` +
            `مرحباً بك يا *${firstName}*! 👋\n\n` +
            `📊 نظرة سريعة:\n` +
            `├ 👥 المشتركين: *${active}* نشط من أصل *${total}*\n` +
            `└ 📺 القنوات: *${channels?.length || 0}*\n\n` +
            `اختر أحد الخيارات:`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
      } else {
        // Check subscription
        const { data: sub } = await sb
          .from("telegram_subscribers")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("telegram_user_id", fromId)
          .maybeSingle();

        if (sub && (sub.is_permanent || (sub.expires_at && new Date(sub.expires_at) > new Date()))) {
          const { data: channels } = await sb
            .from("telegram_channels")
            .select("channel_name, invite_link")
            .eq("owner_id", ownerId);

          const subStatus = sub.is_permanent
            ? "♾ *دائم*"
            : `📅 متبقي *${daysRemaining(sub.expires_at!)}* يوم (حتى ${formatDate(sub.expires_at!)})`;

          const buttons = (channels || [])
            .filter((ch: any) => ch.invite_link)
            .map((ch: any) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);

          buttons.push([{ text: "ℹ️ حالة اشتراكي", callback_data: "my_subscription" }]);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `مرحباً *${firstName}*! 👋\n\n✅ أنت مشترك\n${subStatus}\n\n📺 اضغط على القنوات للانضمام:`,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: buttons },
          });
        } else if (sub) {
          // Expired
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

    // /id command - anyone can use
    if (text === "/id" || text === "/myid") {
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🆔 معرفك: \`${fromId}\`\n👤 الاسم: ${firstName}${msg.from.username ? `\n📛 المعرف: @${msg.from.username}` : ""}`,
        parse_mode: "Markdown",
      });
      return;
    }

    // Non-admin gets subscription info or rejection
    if (!isAdmin) {
      // Check if subscriber wants status
      if (text === "/status" || text === "/حالتي") {
        const { data: sub } = await sb
          .from("telegram_subscribers")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("telegram_user_id", fromId)
          .maybeSingle();

        if (sub) {
          const status = sub.is_permanent
            ? "♾ *دائم* — لا ينتهي"
            : new Date(sub.expires_at!) > new Date()
            ? `✅ *نشط* — متبقي *${daysRemaining(sub.expires_at!)}* يوم\n📅 ينتهي: ${formatDate(sub.expires_at!)}`
            : `❌ *منتهي* منذ ${formatDate(sub.expires_at!)}`;

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `📋 *حالة اشتراكك:*\n\n${status}`,
            parse_mode: "Markdown",
          });
        } else {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: nonSubMessage });
        }
        return;
      }

      await tg(botToken, "sendMessage", { chat_id: chatId, text: nonSubMessage });
      return;
    }

    // ─── ADMIN REPLY HANDLING ───
    if (msg.reply_to_message) {
      const replyText = msg.reply_to_message.text || "";

      // Adding subscriber - step 1
      if (replyText.includes("أرسل معرف المستخدم")) {
        let telegramUserId: number | null = null;
        let telegramUsername: string | null = null;

        if (msg.forward_from) {
          telegramUserId = msg.forward_from.id;
          telegramUsername = msg.forward_from.username || null;
        } else if (msg.forward_sender_name) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ هذا المستخدم أخفى معلوماته.\n\n💡 *الحلول:*\n• اطلب منه إرسال /id للبوت\n• أرسل الـ ID الرقمي مباشرة",
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
              text: `⚠️ لا يمكن تحويل *@${input}* إلى ID مباشرة.\n\n💡 اطلب منه إرسال /id للبوت ثم أرسل لي الرقم:`,
              parse_mode: "Markdown",
              reply_markup: { force_reply: true },
            });
            return;
          } else {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: "❌ مدخل غير صالح.\n\n💡 أرسل رقم الـ ID أو حوّل رسالة من المستخدم.",
            });
            return;
          }
        }

        // Check if already a subscriber
        const { data: existing } = await sb
          .from("telegram_subscribers")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("telegram_user_id", telegramUserId)
          .maybeSingle();

        let existingInfo = "";
        if (existing) {
          const status = existing.is_permanent
            ? "♾ دائم"
            : existing.expires_at && new Date(existing.expires_at) > new Date()
            ? `✅ نشط (${daysRemaining(existing.expires_at)} يوم متبقي)`
            : "❌ منتهي";
          existingInfo = `\n\n⚠️ *مشترك حالياً:* ${status}\nسيتم تحديث الاشتراك.`;
        }

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `✅ المعرف: \`${telegramUserId}\`${telegramUsername ? ` (@${telegramUsername})` : ""}${existingInfo}\n\nأرسل عدد أيام الاشتراك:\n• رقم (مثال: 30)\n• أو اكتب *دائم*`,
          parse_mode: "Markdown",
          reply_markup: { force_reply: true },
        });
        return;
      }

      // Adding subscriber - step 2: days
      if (replyText.includes("أرسل عدد أيام الاشتراك")) {
        const idMatch = replyText.match(/المعرف: `?(\d+)/);
        const usernameMatch = replyText.match(/@(\w+)/);
        if (!idMatch) return;
        const telegramUserId = parseInt(idMatch[1]);
        const telegramUsername = usernameMatch ? usernameMatch[1] : null;

        const isPermanent = text.trim() === "دائم";
        const days = isPermanent ? null : parseInt(text.trim());

        if (!isPermanent && (isNaN(days!) || days! <= 0)) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ أدخل رقماً صحيحاً (مثال: 30) أو اكتب *دائم*",
            parse_mode: "Markdown",
          });
          return;
        }

        const expiresAt = isPermanent ? null : new Date(Date.now() + days! * 86400000).toISOString();

        const { error } = await sb.from("telegram_subscribers").upsert(
          {
            owner_id: ownerId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            subscription_days: days,
            expires_at: expiresAt,
            is_permanent: isPermanent,
          },
          { onConflict: "owner_id,telegram_user_id" }
        );

        if (error) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ خطأ: " + error.message,
            reply_markup: adminKeyboard(),
          });
          return;
        }

        // Send invite links to subscriber
        const { data: channels } = await sb
          .from("telegram_channels")
          .select("channel_name, invite_link")
          .eq("owner_id", ownerId);

        const buttons = (channels || [])
          .filter((ch: any) => ch.invite_link)
          .map((ch: any) => [{ text: `📺 ${ch.channel_name}`, url: ch.invite_link }]);

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
          text: `✅ *تمت إضافة المشترك بنجاح!*\n\n🆔 المعرف: \`${telegramUserId}\`\n${subInfo}${buttons.length > 0 ? `\n📺 تم إرسال ${buttons.length} رابط للمشترك` : ""}`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
        return;
      }

      // Adding channel
      if (replyText.includes("أضف قناة")) {
        let channelId: number | null = null;

        if (msg.forward_from_chat) {
          channelId = msg.forward_from_chat.id;
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
                text: `❌ لم يتم العثور على *@${input}*\n\n💡 تأكد من:\n• أن البوت مسؤول في القناة\n• أن اسم المستخدم صحيح`,
                parse_mode: "Markdown",
              });
              return;
            }
          } else {
            await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ مدخل غير صالح." });
            return;
          }
        }

        const chatInfo = await tg(botToken, "getChat", { chat_id: channelId });
        const channelName = chatInfo.ok ? chatInfo.result.title || `قناة ${channelId}` : `قناة ${channelId}`;

        // Verify bot is admin
        if (chatInfo.ok) {
          const memberInfo = await tg(botToken, "getChatMember", { chat_id: channelId, user_id: (await tg(botToken, "getMe", {})).result.id });
          if (!memberInfo.ok || !["administrator", "creator"].includes(memberInfo.result?.status)) {
            await tg(botToken, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ البوت *ليس مسؤولاً* في *${channelName}*\n\nأضف البوت كمسؤول أولاً ثم أعد المحاولة.`,
              parse_mode: "Markdown",
              reply_markup: adminKeyboard(),
            });
            return;
          }
        }

        let inviteLink = "";
        const linkRes = await tg(botToken, "createChatInviteLink", {
          chat_id: channelId,
          creates_join_request: true,
          name: `bot_invite_${channelId}`,
        });

        if (linkRes.ok) {
          inviteLink = linkRes.result.invite_link;
        } else {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `❌ فشل إنشاء رابط الدعوة\n\n💡 تأكد أن البوت لديه صلاحية *دعوة أعضاء* في القناة.`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
          return;
        }

        const { error } = await sb.from("telegram_channels").upsert(
          { owner_id: ownerId, channel_id: channelId, channel_name: channelName, invite_link: inviteLink },
          { onConflict: "owner_id,channel_id" }
        );

        if (error) {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ خطأ: " + error.message, reply_markup: adminKeyboard() });
          return;
        }

        const membersRes = await tg(botToken, "getChatMemberCount", { chat_id: channelId });
        const memberCount = membersRes.ok ? membersRes.result : "—";

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `✅ *تمت إضافة القناة بنجاح!*\n\n📺 الاسم: *${channelName}*\n🆔 المعرف: \`${channelId}\`\n👥 الأعضاء: ${memberCount}\n🔗 رابط الدعوة: [اضغط هنا](${inviteLink})`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
        return;
      }

      // Broadcast
      if (replyText.includes("أرسل الرسالة التي تريد إرسالها")) {
        const { data: subs } = await sb
          .from("telegram_subscribers")
          .select("telegram_user_id, is_permanent, expires_at")
          .eq("owner_id", ownerId);

        // Only send to active subscribers
        const activeSubs = (subs || []).filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date()));

        let sent = 0, failed = 0;
        for (const sub of activeSubs) {
          try {
            if (msg.photo || msg.video || msg.document || msg.animation) {
              await tg(botToken, "copyMessage", {
                chat_id: sub.telegram_user_id,
                from_chat_id: chatId,
                message_id: msg.message_id,
              });
            } else if (msg.forward_from_chat || msg.forward_from) {
              await tg(botToken, "forwardMessage", {
                chat_id: sub.telegram_user_id,
                from_chat_id: chatId,
                message_id: msg.message_id,
              });
            } else {
              await tg(botToken, "sendMessage", { chat_id: sub.telegram_user_id, text });
            }
            sent++;
          } catch {
            failed++;
          }
        }

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📢 *تم الإرسال الجماعي!*\n\n✅ نجح: *${sent}*\n❌ فشل: *${failed}*\n📊 الإجمالي: ${activeSubs.length} مشترك نشط`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
        return;
      }

      // Search subscriber
      if (replyText.includes("أرسل معرف المشترك للبحث")) {
        const input = text.trim().replace(/^@/, "");
        const parsed = parseInt(input);

        let sub: any = null;
        if (!isNaN(parsed)) {
          const { data } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("telegram_user_id", parsed).maybeSingle();
          sub = data;
        } else if (input.length > 0) {
          const { data } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).ilike("telegram_username", `%${input}%`).maybeSingle();
          sub = data;
        }

        if (sub) {
          const status = sub.is_permanent
            ? "♾ دائم"
            : sub.expires_at && new Date(sub.expires_at) > new Date()
            ? `✅ نشط (${daysRemaining(sub.expires_at)} يوم متبقي)\n📅 ينتهي: ${formatDate(sub.expires_at)}`
            : `❌ منتهي منذ ${formatDate(sub.expires_at)}`;

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `🔍 *نتيجة البحث:*\n\n🆔 المعرف: \`${sub.telegram_user_id}\`\n${sub.telegram_username ? `📛 @${sub.telegram_username}\n` : ""}📋 الحالة: ${status}\n📅 تاريخ الإضافة: ${formatDate(sub.created_at)}`,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🗑 حذف هذا المشترك", callback_data: `del_sub_${sub.telegram_user_id}` }],
                [{ text: "🔙 رجوع", callback_data: "back" }],
              ],
            },
          });
        } else {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ لم يتم العثور على مشترك بهذا المعرف.",
            reply_markup: adminKeyboard(),
          });
        }
        return;
      }

      // Delete subscriber
      if (replyText.includes("أرسل معرف المشترك للحذف")) {
        const parsed = parseInt(text.trim());
        if (isNaN(parsed)) {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ أرسل رقم ID فقط." });
          return;
        }

        const { data: sub } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId).eq("telegram_user_id", parsed).maybeSingle();
        if (!sub) {
          await tg(botToken, "sendMessage", { chat_id: chatId, text: "❌ المشترك غير موجود.", reply_markup: adminKeyboard() });
          return;
        }

        // Kick from channels
        const { data: channels } = await sb.from("telegram_channels").select("channel_id, channel_name").eq("owner_id", ownerId);
        let kicked = 0;
        if (channels) {
          for (const ch of channels) {
            const res = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: parsed });
            if (res.ok) {
              await tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: parsed, only_if_banned: true });
              kicked++;
            }
          }
        }

        await sb.from("telegram_subscribers").delete().eq("id", sub.id);

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `✅ *تم حذف المشترك*\n\n🆔 \`${parsed}\`\n🚫 تم طرده من *${kicked}* قناة`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });

        // Notify the user
        await tg(botToken, "sendMessage", {
          chat_id: parsed,
          text: "⚠️ تم إلغاء اشتراكك وإزالتك من القنوات.\nتواصل مع المسؤول لمزيد من المعلومات.",
        });
        return;
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

    // Subscriber checking own subscription
    if (data === "my_subscription") {
      const { data: sub } = await sb
        .from("telegram_subscribers")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("telegram_user_id", cbFromId)
        .maybeSingle();

      await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id });

      if (sub) {
        const status = sub.is_permanent
          ? "♾ *دائم* — لا ينتهي أبداً"
          : sub.expires_at && new Date(sub.expires_at) > new Date()
          ? `✅ *نشط*\n📅 ينتهي: ${formatDate(sub.expires_at)}\n⏳ متبقي: *${daysRemaining(sub.expires_at)}* يوم`
          : `❌ *منتهي* منذ ${formatDate(sub.expires_at!)}`;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📋 *تفاصيل اشتراكك:*\n\n${status}\n📅 تاريخ الاشتراك: ${formatDate(sub.created_at)}`,
          parse_mode: "Markdown",
        });
      }
      return;
    }

    // Admin only from here
    const isCbAdmin = !adminTelegramId || cbFromId === adminTelegramId;
    if (!isCbAdmin) {
      await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "⛔ غير مصرح لك" });
      return;
    }

    await tg(botToken, "answerCallbackQuery", { callback_query_id: cb.id });

    switch (data) {
      case "add_subscriber": {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "👤 *أرسل معرف المستخدم* بإحدى الطرق:\n\n1️⃣ الـ Telegram ID (رقم)\n2️⃣ @username\n3️⃣ حوّل (Forward) رسالة منه\n\n💡 يمكن للمستخدم معرفة ID الخاص به بإرسال /id للبوت",
          parse_mode: "Markdown",
          reply_markup: { force_reply: true },
        });
        break;
      }

      case "list_subscribers": {
        const { data: subs } = await sb
          .from("telegram_subscribers")
          .select("*")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (!subs || subs.length === 0) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "📋 لا يوجد مشتركون حالياً.\n\nاضغط *➕ إضافة مشترك* للبدء.",
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
        } else {
          let msgText = `📋 *قائمة المشتركين (${subs.length}):*\n\n`;
          for (const s of subs) {
            const status = s.is_permanent
              ? "♾"
              : s.expires_at && new Date(s.expires_at) > new Date()
              ? `✅ ${daysRemaining(s.expires_at)}ي`
              : "❌";
            const username = s.telegram_username ? ` @${s.telegram_username}` : "";
            msgText += `${status} \`${s.telegram_user_id}\`${username}\n`;
          }
          msgText += `\n💡 اضغط *🔍 بحث* للتفاصيل`;

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: msgText,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
        }
        break;
      }

      case "manage_channels": {
        const { data: channels } = await sb
          .from("telegram_channels")
          .select("*")
          .eq("owner_id", ownerId);

        if (!channels || channels.length === 0) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "📺 لا توجد قنوات مربوطة.\n\nاضغط *➕ إضافة قناة* للبدء.",
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
        } else {
          let msgText = `📺 *القنوات المربوطة (${channels.length}):*\n\n`;
          const buttons = [];
          for (const ch of channels) {
            msgText += `• *${ch.channel_name}*\n  🆔 \`${ch.channel_id}\`${ch.invite_link ? "\n  🔗 رابط دعوة متاح" : ""}\n\n`;
            buttons.push([{ text: `🗑 حذف ${ch.channel_name}`, callback_data: `del_ch_${ch.channel_id}` }]);
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
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "📺 *أضف قناة* بإحدى الطرق:\n\n1️⃣ معرف القناة (رقم سالب)\n2️⃣ @username القناة\n3️⃣ حوّل رسالة من القناة\n\n⚠️ تأكد من إضافة البوت كمسؤول أولاً!",
          parse_mode: "Markdown",
          reply_markup: { force_reply: true },
        });
        break;
      }

      case "broadcast": {
        const { data: subs } = await sb
          .from("telegram_subscribers")
          .select("is_permanent, expires_at")
          .eq("owner_id", ownerId);

        const active = (subs || []).filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date())).length;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📢 *رسالة جماعية*\n\nسيتم إرسالها لـ *${active}* مشترك نشط.\n\nأرسل الرسالة التي تريد إرسالها (نص، صورة، فيديو، أو حوّل رسالة):`,
          parse_mode: "Markdown",
          reply_markup: { force_reply: true },
        });
        break;
      }

      case "search_subscriber": {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "🔍 *أرسل معرف المشترك للبحث*\n\nيمكنك إرسال:\n• رقم الـ ID\n• @username",
          parse_mode: "Markdown",
          reply_markup: { force_reply: true },
        });
        break;
      }

      case "delete_subscriber": {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "🗑 *أرسل معرف المشترك للحذف* (الـ ID الرقمي):\n\n⚠️ سيتم طرده من جميع القنوات وحذفه نهائياً.",
          parse_mode: "Markdown",
          reply_markup: { force_reply: true },
        });
        break;
      }

      case "stats": {
        const { data: subs } = await sb.from("telegram_subscribers").select("*").eq("owner_id", ownerId);
        const { data: channels } = await sb.from("telegram_channels").select("*").eq("owner_id", ownerId);

        const total = subs?.length || 0;
        const active = subs?.filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date())).length || 0;
        const permanent = subs?.filter((s: any) => s.is_permanent).length || 0;
        const expired = total - active;
        const channelCount = channels?.length || 0;

        // Expiring soon (within 3 days)
        const expiringSoon = subs?.filter((s: any) => 
          !s.is_permanent && s.expires_at && 
          new Date(s.expires_at) > new Date() && 
          daysRemaining(s.expires_at) <= 3
        ).length || 0;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📊 *إحصائيات النظام:*\n\n` +
            `👥 *المشتركين:*\n` +
            `├ إجمالي: *${total}*\n` +
            `├ ✅ نشطون: *${active}*\n` +
            `├ ♾ دائمون: *${permanent}*\n` +
            `├ ❌ منتهيون: *${expired}*\n` +
            `└ ⚠️ ينتهي خلال 3 أيام: *${expiringSoon}*\n\n` +
            `📺 *القنوات:* ${channelCount}`,
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
        break;
      }

      case "back": {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "🤖 *لوحة التحكم الرئيسية*",
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
        break;
      }

      default: {
        // Delete channel
        if (data.startsWith("del_ch_")) {
          const channelId = parseInt(data.replace("del_ch_", ""));
          const { data: ch } = await sb.from("telegram_channels").select("channel_name").eq("owner_id", ownerId).eq("channel_id", channelId).maybeSingle();

          await sb.from("telegram_channels").delete().eq("owner_id", ownerId).eq("channel_id", channelId);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ تم حذف القناة *${ch?.channel_name || channelId}*`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });
        }

        // Delete subscriber from search
        if (data.startsWith("del_sub_")) {
          const userId = parseInt(data.replace("del_sub_", ""));

          const { data: channels } = await sb.from("telegram_channels").select("channel_id").eq("owner_id", ownerId);
          let kicked = 0;
          if (channels) {
            for (const ch of channels) {
              const res = await tg(botToken, "banChatMember", { chat_id: ch.channel_id, user_id: userId });
              if (res.ok) {
                await tg(botToken, "unbanChatMember", { chat_id: ch.channel_id, user_id: userId, only_if_banned: true });
                kicked++;
              }
            }
          }

          await sb.from("telegram_subscribers").delete().eq("owner_id", ownerId).eq("telegram_user_id", userId);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: `✅ *تم حذف المشترك* \`${userId}\`\n🚫 تم طرده من *${kicked}* قناة`,
            parse_mode: "Markdown",
            reply_markup: adminKeyboard(),
          });

          await tg(botToken, "sendMessage", {
            chat_id: userId,
            text: "⚠️ تم إلغاء اشتراكك. تواصل مع المسؤول لمزيد من المعلومات.",
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

      const update = await req.json();
      await handleUpdate(update, tokenFromPath, settings.user_id, settings.admin_telegram_id, settings.non_subscriber_message);
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { action, bot_token, owner_id } = body;

      if (action === "setup_webhook") {
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot/${bot_token}`;
        const result = await tg(bot_token, "setWebhook", {
          url: webhookUrl,
          allowed_updates: ["message", "callback_query", "chat_join_request"],
        });
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "check_expiry") {
        const sb = supabaseAdmin();
        const { data: allTokens } = await sb.from("bot_tokens").select("*");

        if (allTokens) {
          for (const tokenRow of allTokens) {
            const { data: expiredSubs } = await sb
              .from("telegram_subscribers")
              .select("*")
              .eq("owner_id", tokenRow.user_id)
              .eq("is_permanent", false)
              .lt("expires_at", new Date().toISOString());

            if (!expiredSubs || expiredSubs.length === 0) continue;

            const { data: channels } = await sb
              .from("telegram_channels")
              .select("channel_id")
              .eq("owner_id", tokenRow.user_id);

            for (const sub of expiredSubs) {
              if (channels) {
                for (const ch of channels) {
                  await tg(tokenRow.token, "banChatMember", { chat_id: ch.channel_id, user_id: sub.telegram_user_id });
                  await tg(tokenRow.token, "unbanChatMember", { chat_id: ch.channel_id, user_id: sub.telegram_user_id, only_if_banned: true });
                }
              }

              await tg(tokenRow.token, "sendMessage", {
                chat_id: sub.telegram_user_id,
                text: "⚠️ *انتهى اشتراكك*\n\nتم إزالتك من القنوات.\nتواصل مع المسؤول للتجديد.",
                parse_mode: "Markdown",
              });

              await sb.from("telegram_subscribers").delete().eq("id", sub.id);
            }

            // Notify admin
            if (tokenRow.admin_telegram_id) {
              await tg(tokenRow.token, "sendMessage", {
                chat_id: tokenRow.admin_telegram_id,
                text: `🔔 *تنبيه:* تم إزالة *${expiredSubs.length}* مشترك منتهي الاشتراك.`,
                parse_mode: "Markdown",
              });
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
