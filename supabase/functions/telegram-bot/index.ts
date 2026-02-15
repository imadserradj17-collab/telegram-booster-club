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

// Get bot token for an owner
async function getBotToken(ownerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("bot_tokens")
    .select("token")
    .eq("user_id", ownerId)
    .maybeSingle();
  return data?.token || null;
}

// Get bot settings by token value (for webhook matching)
async function getBotSettingsByToken(token: string): Promise<{ user_id: string; admin_telegram_id: number | null; non_subscriber_message: string } | null> {
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

// Main admin keyboard
function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ إضافة مشترك", callback_data: "add_subscriber" }],
      [{ text: "📋 قائمة المشتركين", callback_data: "list_subscribers" }],
      [{ text: "📺 إدارة القنوات", callback_data: "manage_channels" }],
      [{ text: "➕ إضافة قناة", callback_data: "add_channel" }],
      [{ text: "📢 رسالة جماعية", callback_data: "broadcast" }],
      
      [{ text: "📊 إحصائيات", callback_data: "stats" }],
    ],
  };
}

// Handle incoming updates
async function handleUpdate(update: any, botToken: string, ownerId: string, adminTelegramId: number | null, nonSubMessage: string) {
  const sb = supabaseAdmin();

  // Handle chat join requests - AUTO APPROVE
  if (update.chat_join_request) {
    const req = update.chat_join_request;
    const telegramUserId = req.from.id;
    const chatId = req.chat.id;

    // Check if subscriber exists and is active
    const { data: sub } = await sb
      .from("telegram_subscribers")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (sub) {
      // Check expiry
      if (!sub.is_permanent && sub.expires_at && new Date(sub.expires_at) < new Date()) {
        await tg(botToken, "declineChatJoinRequest", {
          chat_id: chatId,
          user_id: telegramUserId,
        });
        await tg(botToken, "sendMessage", {
          chat_id: telegramUserId,
          text: "❌ انتهى اشتراكك. تواصل مع المسؤول للتجديد.",
        });
      } else {
        await tg(botToken, "approveChatJoinRequest", {
          chat_id: chatId,
          user_id: telegramUserId,
        });
      }
    } else {
      await tg(botToken, "declineChatJoinRequest", {
        chat_id: chatId,
        user_id: telegramUserId,
      });
      // Send custom non-subscriber message
      await tg(botToken, "sendMessage", {
        chat_id: telegramUserId,
        text: nonSubMessage,
      });
    }
    return;
  }

  // Handle messages
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text || "";
    const fromId = msg.from.id;

    // Check if sender is the admin
    const isAdmin = !adminTelegramId || fromId === adminTelegramId;

    if (text === "/start") {
      if (isAdmin) {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "🤖 *لوحة تحكم بوت الاشتراكات*\n\nمرحباً بك في نظام إدارة اشتراكات القنوات.\nاختر أحد الخيارات:",
          parse_mode: "Markdown",
          reply_markup: adminKeyboard(),
        });
      } else {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: nonSubMessage,
        });
      }
      return;
    }

    // Only admin can use other commands
    if (!isAdmin) {
      await tg(botToken, "sendMessage", {
        chat_id: chatId,
        text: nonSubMessage,
      });
      return;
    }

    // Check for pending state in message context
    // We use reply_to_message to track state
    if (msg.reply_to_message) {
      const replyText = msg.reply_to_message.text || "";

      // Adding subscriber - step 1: got user ID
      if (replyText.includes("أرسل معرف المستخدم")) {
        const telegramUserId = parseInt(text.trim());
        if (isNaN(telegramUserId)) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ معرف غير صالح. أرسل رقم المعرف فقط.",
          });
          return;
        }
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `✅ المعرف: ${telegramUserId}\n\nأرسل عدد أيام الاشتراك (أو اكتب "دائم" لاشتراك دائم):`,
          reply_markup: { force_reply: true },
        });
        return;
      }

      // Adding subscriber - step 2: got days
      if (replyText.includes("أرسل عدد أيام الاشتراك")) {
        // Extract user ID from previous message
        const idMatch = replyText.match(/المعرف: (\d+)/);
        if (!idMatch) return;
        const telegramUserId = parseInt(idMatch[1]);

        const isPermanent = text.trim() === "دائم";
        const days = isPermanent ? null : parseInt(text.trim());

        if (!isPermanent && (isNaN(days!) || days! <= 0)) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: '❌ أدخل عدد أيام صحيح أو اكتب "دائم".',
          });
          return;
        }

        const expiresAt = isPermanent ? null : new Date(Date.now() + days! * 86400000).toISOString();

        // Upsert subscriber
        const { error } = await sb.from("telegram_subscribers").upsert(
          {
            owner_id: ownerId,
            telegram_user_id: telegramUserId,
            telegram_username: null,
            subscription_days: days,
            expires_at: expiresAt,
            is_permanent: isPermanent,
          },
          { onConflict: "owner_id,telegram_user_id" }
        );

        if (error) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ خطأ في إضافة المشترك: " + error.message,
          });
          return;
        }

        // Get channels and send invite links to subscriber
        const { data: channels } = await sb
          .from("telegram_channels")
          .select("*")
          .eq("owner_id", ownerId);

        if (channels && channels.length > 0) {
          const buttons = [];
          for (const ch of channels) {
            try {
              const linkRes = await tg(botToken, "createChatInviteLink", {
                chat_id: ch.channel_id,
                creates_join_request: true,
                name: `sub_${telegramUserId}`,
              });
              if (linkRes.ok) {
                buttons.push([{ text: `📺 ${ch.channel_name}`, url: linkRes.result.invite_link }]);
              }
            } catch (e) {
              // Skip channel if can't create link
            }
          }

          if (buttons.length > 0) {
            await tg(botToken, "sendMessage", {
              chat_id: telegramUserId,
              text: "🎉 *تم تفعيل اشتراكك!*\n\nاضغط على الأزرار أدناه للانضمام للقنوات:",
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: buttons },
            });
          }
        }

        const subInfo = isPermanent ? "دائم" : `${days} يوم`;
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `✅ تمت إضافة المشترك ${telegramUserId}\n📅 الاشتراك: ${subInfo}`,
          reply_markup: adminKeyboard(),
        });
        return;
      }

      // Adding channel - got channel ID
      if (replyText.includes("أرسل معرف القناة")) {
        const channelId = parseInt(text.trim());
        if (isNaN(channelId)) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ معرف غير صالح.",
          });
          return;
        }

        // Try to get channel info
        const chatInfo = await tg(botToken, "getChat", { chat_id: channelId });
        const channelName = chatInfo.ok ? chatInfo.result.title || `قناة ${channelId}` : `قناة ${channelId}`;

        const { error } = await sb.from("telegram_channels").upsert(
          {
            owner_id: ownerId,
            channel_id: channelId,
            channel_name: channelName,
          },
          { onConflict: "owner_id,channel_id" }
        );

        if (error) {
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "❌ خطأ: " + error.message,
          });
          return;
        }

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `✅ تمت إضافة القناة: ${channelName}`,
          reply_markup: adminKeyboard(),
        });
        return;
      }

      // Broadcast message
      if (replyText.includes("أرسل الرسالة التي تريد إرسالها")) {
        const { data: subs } = await sb
          .from("telegram_subscribers")
          .select("telegram_user_id")
          .eq("owner_id", ownerId);

        let sent = 0;
        let failed = 0;
        if (subs) {
          for (const sub of subs) {
            try {
              if (msg.forward_from_chat || msg.forward_from) {
                await tg(botToken, "forwardMessage", {
                  chat_id: sub.telegram_user_id,
                  from_chat_id: chatId,
                  message_id: msg.message_id,
                });
              } else {
                await tg(botToken, "sendMessage", {
                  chat_id: sub.telegram_user_id,
                  text: text,
                });
              }
              sent++;
            } catch {
              failed++;
            }
          }
        }

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📢 تم الإرسال!\n✅ نجح: ${sent}\n❌ فشل: ${failed}`,
          reply_markup: adminKeyboard(),
        });
        return;
      }
    }
    return;
  }

  // Handle callback queries
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const cbFromId = cb.from.id;
    const data = cb.data;

    // Only admin can use callback buttons
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
          text: "👤 أرسل معرف المستخدم (Telegram ID):",
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
            text: "📋 لا يوجد مشتركون حالياً.",
            reply_markup: adminKeyboard(),
          });
        } else {
          let text = "📋 *قائمة المشتركين:*\n\n";
          for (const s of subs) {
            const status = s.is_permanent
              ? "♾ دائم"
              : new Date(s.expires_at) > new Date()
              ? `✅ حتى ${new Date(s.expires_at).toLocaleDateString("ar-SA")}`
              : "❌ منتهي";
            text += `• \`${s.telegram_user_id}\` — ${status}\n`;
          }
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text,
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
            text: "📺 لا توجد قنوات مربوطة.",
            reply_markup: adminKeyboard(),
          });
        } else {
          let text = "📺 *القنوات المربوطة:*\n\n";
          const buttons = [];
          for (const ch of channels) {
            text += `• ${ch.channel_name} (\`${ch.channel_id}\`)\n`;
            buttons.push([{ text: `🗑 حذف ${ch.channel_name}`, callback_data: `del_ch_${ch.channel_id}` }]);
          }
          buttons.push([{ text: "🔙 رجوع", callback_data: "back" }]);
          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: buttons },
          });
        }
        break;
      }

      case "add_channel": {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "📺 أرسل معرف القناة (Channel ID):\n\nملاحظة: تأكد من إضافة البوت كمسؤول في القناة أولاً.",
          reply_markup: { force_reply: true },
        });
        break;
      }

      case "broadcast": {
        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: "📢 أرسل الرسالة التي تريد إرسالها لجميع المشتركين (يمكنك إعادة توجيه رسالة):",
          reply_markup: { force_reply: true },
        });
        break;
      }


      case "stats": {
        const { data: subs } = await sb
          .from("telegram_subscribers")
          .select("*")
          .eq("owner_id", ownerId);

        const { data: channels } = await sb
          .from("telegram_channels")
          .select("*")
          .eq("owner_id", ownerId);

        const total = subs?.length || 0;
        const active = subs?.filter((s: any) => s.is_permanent || (s.expires_at && new Date(s.expires_at) > new Date())).length || 0;
        const expired = total - active;
        const channelCount = channels?.length || 0;

        await tg(botToken, "sendMessage", {
          chat_id: chatId,
          text: `📊 *إحصائيات النظام:*\n\n👥 إجمالي المشتركين: ${total}\n✅ نشطون: ${active}\n❌ منتهيون: ${expired}\n📺 القنوات: ${channelCount}`,
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
        // Handle delete channel callbacks
        if (data.startsWith("del_ch_")) {
          const channelId = parseInt(data.replace("del_ch_", ""));
          await sb
            .from("telegram_channels")
            .delete()
            .eq("owner_id", ownerId)
            .eq("channel_id", channelId);

          await tg(botToken, "sendMessage", {
            chat_id: chatId,
            text: "✅ تم حذف القناة.",
            reply_markup: adminKeyboard(),
          });
        }
        break;
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    // Extract token from path: /telegram-bot/<token>
    const tokenFromPath = pathParts[pathParts.length - 1];

    if (req.method === "POST" && tokenFromPath && tokenFromPath.includes(":")) {
      // This is a webhook call from Telegram
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

    // Setup webhook endpoint (called from frontend)
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
        // Called by cron - check all subscribers
        const sb = supabaseAdmin();
        const { data: expired } = await sb
          .from("telegram_subscribers")
          .select("*, bot_tokens!inner(token)")
          .eq("is_permanent", false)
          .lt("expires_at", new Date().toISOString());

        // This won't work because of the join. Let's do it differently.
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
              // Kick from all channels
              if (channels) {
                for (const ch of channels) {
                  await tg(tokenRow.token, "banChatMember", {
                    chat_id: ch.channel_id,
                    user_id: sub.telegram_user_id,
                  });
                  // Unban so they can rejoin later
                  await tg(tokenRow.token, "unbanChatMember", {
                    chat_id: ch.channel_id,
                    user_id: sub.telegram_user_id,
                    only_if_banned: true,
                  });
                }
              }

              // Notify user
              await tg(tokenRow.token, "sendMessage", {
                chat_id: sub.telegram_user_id,
                text: "⚠️ انتهى اشتراكك. تم إزالتك من القنوات.\nتواصل مع المسؤول للتجديد.",
              });

              // Delete subscriber
              await sb.from("telegram_subscribers").delete().eq("id", sub.id);
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
