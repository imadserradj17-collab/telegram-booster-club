// Bilingual messages for the Telegram bot (AR default, EN alternative).
// Each entry is a function that returns a localized string.

export type Lang = "ar" | "en";

export function normalizeLang(l: string | null | undefined): Lang {
  return l === "en" ? "en" : "ar";
}

type V = Record<string, string | number>;
const fill = (s: string, v?: V) =>
  v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? "")) : s;

const M: Record<string, { ar: string; en: string }> = {
  // ─── Common ───
  cancelled: { ar: "❌ تم الإلغاء.", en: "❌ Cancelled." },
  invalidInput: {
    ar: "❌ مدخل غير صالح. أرسل الـ ID أو حوّل رسالة.",
    en: "❌ Invalid input. Send the ID or forward a message.",
  },
  sessionExpired: {
    ar: "⚠️ انتهت صلاحية العملية. أعد المحاولة.",
    en: "⚠️ Session expired. Please try again.",
  },
  error: { ar: "❌ خطأ: {msg}", en: "❌ Error: {msg}" },
  controlPanel: { ar: "🤖 *لوحة التحكم*", en: "🤖 *Control Panel*" },

  // ─── Language picker ───
  langPickerTitle: {
    ar: "🌐 اختر لغتك / Choose your language",
    en: "🌐 Choose your language / اختر لغتك",
  },
  langArabic: { ar: "🇸🇦 العربية", en: "🇸🇦 العربية" },
  langEnglish: { ar: "🇬🇧 English", en: "🇬🇧 English" },
  langChanged: { ar: "✅ تم تغيير اللغة إلى العربية.", en: "✅ Language changed to English." },
  langButton: { ar: "🌐 اللغة", en: "🌐 Language" },

  // ─── Admin keyboard ───
  btnAddSub: { ar: "➕ إضافة مشترك", en: "➕ Add Subscriber" },
  btnListSubs: { ar: "📋 المشتركين", en: "📋 Subscribers" },
  btnAddCh: { ar: "➕ إضافة قناة/مجموعة", en: "➕ Add Channel/Group" },
  btnManageCh: { ar: "📺 القنوات والمجموعات", en: "📺 Channels & Groups" },
  btnBroadcast: { ar: "📢 رسالة جماعية", en: "📢 Broadcast" },
  btnStats: { ar: "📊 إحصائيات", en: "📊 Statistics" },
  btnSearch: { ar: "🔍 بحث عن مشترك", en: "🔍 Search Subscriber" },
  btnDelSub: { ar: "🗑 حذف مشترك", en: "🗑 Delete Subscriber" },
  btnDelete: { ar: "🗑 حذف", en: "🗑 Delete" },
  btnBack: { ar: "🔙 رجوع", en: "🔙 Back" },
  btnCancel: { ar: "❌ إلغاء", en: "❌ Cancel" },
  btnAll: { ar: "✅ الكل", en: "✅ All" },
  btnConfirm: { ar: "📥 تأكيد الاختيار", en: "📥 Confirm" },
  btnConfirmN: { ar: "📥 تأكيد الاختيار ({n})", en: "📥 Confirm ({n})" },
  btnPermanent: { ar: "♾ دائم", en: "♾ Permanent" },
  btnCustomDays: { ar: "✏️ إدخال يدوي", en: "✏️ Custom days" },
  btnMySub: { ar: "ℹ️ حالة اشتراكي", en: "ℹ️ My subscription" },
  btnFreeTrial: {
    ar: "🎁 تجربة مجانية ({n} {unit})",
    en: "🎁 Free trial ({n} {unit})",
  },
  unitDay: { ar: "يوم", en: "day" },
  unitDays: { ar: "أيام", en: "days" },
  daysWord: { ar: "يوم", en: "days" },
  daysShort: { ar: "ي", en: "d" },
  dayN: { ar: "{n} يوم", en: "{n} days" },

  // ─── /start admin ───
  adminWelcome: {
    ar: "🤖 *لوحة تحكم بوت الاشتراكات*\n\nمرحباً بك يا *{name}*! 👋\n\n📊 نظرة سريعة:\n├ 👥 المشتركين: *{active}* نشط من أصل *{total}*\n└ 📺 القنوات: *{channels}*",
    en: "🤖 *Subscription Bot Dashboard*\n\nWelcome *{name}*! 👋\n\n📊 Quick overview:\n├ 👥 Subscribers: *{active}* active out of *{total}*\n└ 📺 Channels: *{channels}*",
  },

  // ─── /start user ───
  userActive: {
    ar: "مرحباً *{name}*! 👋\n\n✅ أنت مشترك\n{status}\n\n📺 اضغط على القنوات للانضمام:",
    en: "Hello *{name}*! 👋\n\n✅ You are subscribed\n{status}\n\n📺 Tap the channels to join:",
  },
  statusPermanent: { ar: "♾ *دائم*", en: "♾ *Permanent*" },
  statusActiveLeft: {
    ar: "📅 متبقي *{n}* يوم (حتى {date})",
    en: "📅 *{n}* days left (until {date})",
  },
  userExpired: {
    ar: "⏰ مرحباً *{name}*\n\nللأسف اشتراكك *منتهي* منذ {date}.\n\nتواصل مع المسؤول لتجديد اشتراكك.",
    en: "⏰ Hello *{name}*\n\nUnfortunately your subscription *expired* on {date}.\n\nContact the admin to renew.",
  },
  mandatoryMust: {
    ar: "⚠️ مرحباً *{name}*!\n\n🔒 يجب عليك الانضمام إلى القناة الإجبارية أولاً قبل الوصول إلى القنوات.\n\nانضم ثم اضغط /start مرة أخرى.",
    en: "⚠️ Hello *{name}*!\n\n🔒 You must join the mandatory channel first before accessing the channels.\n\nJoin then press /start again.",
  },
  mandatoryMustShort: {
    ar: "⚠️ يجب عليك الانضمام إلى القناة الإجبارية أولاً.\n\nانضم ثم اضغط /start مرة أخرى.",
    en: "⚠️ You must join the mandatory channel first.\n\nJoin then press /start again.",
  },
  kickedFromAll: {
    ar: "🚫 *تم طردك من جميع القنوات والمجموعات!*\n\n❌ لقد غادرت القناة/المجموعة الإجبارية.\n\n⚠️ لن تتمكن من الوصول إلى أي قناة حتى تنضم مرة أخرى.\n\n👇 اضغط على الزر أدناه للانضمام ثم أرسل /start لاستعادة الوصول:",
    en: "🚫 *You have been removed from all channels and groups!*\n\n❌ You left the mandatory channel/group.\n\n⚠️ You won't be able to access any channel until you rejoin.\n\n👇 Tap the button below to rejoin then send /start to restore access:",
  },
  joinMandatoryBtn: { ar: "{icon} انضم إلى {name}", en: "{icon} Join {name}" },

  // ─── ID / Status ───
  myIdMsg: {
    ar: "🆔 معرفك: `{id}`\n👤 الاسم: {name}{uname}",
    en: "🆔 Your ID: `{id}`\n👤 Name: {name}{uname}",
  },
  myStatus: {
    ar: "📋 *حالة اشتراكك:*\n\n{status}",
    en: "📋 *Your subscription status:*\n\n{status}",
  },
  statusPermNoExp: { ar: "♾ *دائم* — لا ينتهي", en: "♾ *Permanent* — never expires" },
  statusActive: {
    ar: "✅ *نشط* — متبقي *{n}* يوم\n📅 ينتهي: {date}",
    en: "✅ *Active* — *{n}* days left\n📅 Expires: {date}",
  },
  statusExpired: {
    ar: "❌ *منتهي* منذ {date}",
    en: "❌ *Expired* on {date}",
  },

  // ─── Subscriber notifications ───
  subActivated: {
    ar: "🎉 *تم تفعيل اشتراكك!*\n\nاضغط على الأزرار للانضمام:",
    en: "🎉 *Your subscription is active!*\n\nTap the buttons to join:",
  },
  subAddedAdmin: {
    ar: "✅ *تمت إضافة المشترك بنجاح!*\n\n🆔 المعرف: `{id}`\n{info}\n📺 القنوات: *{n}*{notif}",
    en: "✅ *Subscriber added successfully!*\n\n🆔 ID: `{id}`\n{info}\n📺 Channels: *{n}*{notif}",
  },
  subInfoPerm: { ar: "♾ دائم", en: "♾ Permanent" },
  subInfoDays: { ar: "📅 {n} يوم (حتى {date})", en: "📅 {n} days (until {date})" },
  notifSent: { ar: "\n✉️ تم إرسال {n} رابط للمشترك", en: "\n✉️ Sent {n} invite(s) to subscriber" },
  notifNotSent: {
    ar: "\n⚠️ لم يتم إرسال الروابط (المشترك لم يبدأ البوت)",
    en: "\n⚠️ Links not sent (subscriber hasn't started the bot)",
  },
  joinAccepted: {
    ar: "✅ تم قبولك في القناة *{title}*! مرحباً بك 🎉",
    en: "✅ You've been accepted in *{title}*! Welcome 🎉",
  },
  expiredSubMsg: {
    ar: "⏰ *انتهى اشتراكك!*\n\nتواصل مع المسؤول لتجديد الاشتراك.",
    en: "⏰ *Your subscription expired!*\n\nContact the admin to renew.",
  },
  noPermission: {
    ar: "⛔ *ليس لديك صلاحية لهذه القناة.*\n\nاشتراكك لا يشمل هذه القناة. تواصل مع المسؤول.",
    en: "⛔ *You don't have access to this channel.*\n\nYour subscription doesn't cover it. Contact the admin.",
  },
  joinReqAccepted: {
    ar: "📥 *طلب انضمام مقبول*\n\n👤 {name} (`{id}`)\n📺 {chTitle}",
    en: "📥 *Join request accepted*\n\n👤 {name} (`{id}`)\n📺 {chTitle}",
  },
  joinReqDeclined: {
    ar: "🚫 *طلب انضمام مرفوض*\n\n👤 {name} (`{id}`) — غير مشترك\n📺 {chTitle}",
    en: "🚫 *Join request declined*\n\n👤 {name} (`{id}`) — not subscribed\n📺 {chTitle}",
  },

  // ─── Add subscriber flow ───
  hiddenUser: {
    ar: "❌ هذا المستخدم أخفى معلوماته.\n\n💡 اطلب منه إرسال /id للبوت، أو أرسل الـ ID الرقمي مباشرة.",
    en: "❌ This user hid their info.\n\n💡 Ask them to send /id to the bot, or send the numeric ID directly.",
  },
  cantResolveUsername: {
    ar: "⚠️ لا يمكن تحويل *@{u}* إلى ID مباشرة.\n\n💡 اطلب منه إرسال /id للبوت ثم أرسل لي الرقم.",
    en: "⚠️ Can't resolve *@{u}* to ID directly.\n\n💡 Ask them to send /id to the bot then send me the number.",
  },
  alreadySubscribed: {
    ar: "\n\n⚠️ *مشترك حالياً:* {status}\nسيتم تحديث الاشتراك.",
    en: "\n\n⚠️ *Already subscribed:* {status}\nSubscription will be updated.",
  },
  chooseDuration: {
    ar: "✅ المعرف: `{id}`{uname}{existing}\n\n📅 اختر مدة الاشتراك:",
    en: "✅ ID: `{id}`{uname}{existing}\n\n📅 Choose subscription duration:",
  },
  enterValidDays: {
    ar: "❌ أدخل رقماً صحيحاً (مثال: 30) أو اكتب *دائم*\n\n_أرسل /cancel للإلغاء_",
    en: "❌ Enter a valid number (e.g. 30) or type *permanent*\n\n_Send /cancel to cancel_",
  },
  pickChannels: {
    ar: "📺 *اختر القنوات للمشترك:*\n\nاضغط على القناة لتحديدها/إلغاء تحديدها، ثم اضغط تأكيد.",
    en: "📺 *Pick channels for the subscriber:*\n\nTap a channel to toggle, then tap Confirm.",
  },
  pickHelp: {
    ar: "💡 اضغط على الأزرار لاختيار القنوات ثم اضغط *تأكيد الاختيار*.",
    en: "💡 Tap the buttons to pick channels then tap *Confirm*.",
  },
  needOneChannel: {
    ar: "⚠️ يجب اختيار قناة واحدة على الأقل!",
    en: "⚠️ Pick at least one channel!",
  },
  enterCustomDays: {
    ar: "✏️ *أدخل عدد الأيام يدوياً:*\n\nأرسل رقماً بين 1 و 9999\n\n_أرسل /cancel للإلغاء_",
    en: "✏️ *Enter custom number of days:*\n\nSend a number between 1 and 9999\n\n_Send /cancel to cancel_",
  },
  customDaysRange: {
    ar: "❌ أدخل رقماً صحيحاً بين 1 و 9999\n\n_أرسل /cancel للإلغاء_",
    en: "❌ Enter a number between 1 and 9999\n\n_Send /cancel to cancel_",
  },
  addSubPrompt: {
    ar: "👤 *إضافة مشترك*\n\nأرسل معرف المستخدم بإحدى الطرق:\n\n1️⃣ الـ Telegram ID (رقم)\n2️⃣ حوّل (Forward) رسالة منه\n\n💡 يمكنه معرفة ID بإرسال /id للبوت\n\n_أرسل /cancel للإلغاء_",
    en: "👤 *Add Subscriber*\n\nSend the user identifier in one of these ways:\n\n1️⃣ Telegram ID (number)\n2️⃣ Forward a message from them\n\n💡 They can get their ID by sending /id to the bot\n\n_Send /cancel to cancel_",
  },

  // ─── List & Manage ───
  noSubs: { ar: "📋 لا يوجد مشتركون حالياً.", en: "📋 No subscribers yet." },
  subsList: { ar: "📋 *المشتركون ({n}):*\n\n", en: "📋 *Subscribers ({n}):*\n\n" },
  noChannels: { ar: "📺 لا توجد قنوات أو مجموعات.", en: "📺 No channels or groups." },
  channelsList: {
    ar: "📺 *القنوات والمجموعات ({n}):*\n\n",
    en: "📺 *Channels & Groups ({n}):*\n\n",
  },
  channelLine: {
    ar: "{icon} *{name}* ({type})\n  🆔 `{id}`{link}\n",
    en: "{icon} *{name}* ({type})\n  🆔 `{id}`{link}\n",
  },
  channelLinkAvail: { ar: " — 🔗 رابط متاح", en: " — 🔗 Link available" },
  typeChannel: { ar: "قناة", en: "channel" },
  typeGroup: { ar: "مجموعة", en: "group" },
  delChannelBtn: { ar: "🗑 حذف {name}", en: "🗑 Delete {name}" },
  channelDeleted: { ar: "✅ تم حذف *{name}*", en: "✅ Deleted *{name}*" },

  addChannelPrompt: {
    ar: "📺 *إضافة قناة أو مجموعة*\n\nأرسل بإحدى الطرق:\n\n1️⃣ معرف القناة/المجموعة (رقم سالب)\n2️⃣ @username\n3️⃣ حوّل رسالة من القناة/المجموعة\n\n⚠️ البوت يجب أن يكون مسؤولاً!\n\n_أرسل /cancel للإلغاء_",
    en: "📺 *Add Channel or Group*\n\nSend in one of these ways:\n\n1️⃣ Channel/Group ID (negative number)\n2️⃣ @username\n3️⃣ Forward a message from it\n\n⚠️ Bot must be admin!\n\n_Send /cancel to cancel_",
  },
  channelNotFound: {
    ar: "❌ لم يتم العثور على *@{u}*\n\n💡 تأكد أن البوت مسؤول فيها.",
    en: "❌ *@{u}* not found\n\n💡 Make sure the bot is admin there.",
  },
  botNotAdmin: {
    ar: "⚠️ البوت *ليس مسؤولاً* في *{name}*\n\nأضف البوت كمسؤول أولاً.",
    en: "⚠️ The bot is *not an admin* in *{name}*\n\nAdd the bot as admin first.",
  },
  inviteFailed: {
    ar: "❌ فشل إنشاء رابط الدعوة\n\n💡 تأكد أن البوت لديه صلاحية *دعوة أعضاء*.",
    en: "❌ Failed to create invite link\n\n💡 Make sure the bot has *invite members* permission.",
  },
  channelAdded: {
    ar: "✅ *تمت الإضافة بنجاح!*\n\n{icon} *{name}* ({type})\n🆔 `{id}`\n👥 الأعضاء: {members}\n🔗 [رابط الدعوة]({link})",
    en: "✅ *Added successfully!*\n\n{icon} *{name}* ({type})\n🆔 `{id}`\n👥 Members: {members}\n🔗 [Invite link]({link})",
  },
  autoAssignedNotice: {
    ar: "📌 تم إضافة القناة الجديدة تلقائياً لـ *{n}* مشترك يملكون جميع القنوات.",
    en: "📌 New channel auto-assigned to *{n}* subscriber(s) with full access.",
  },
  channelDefault: { ar: "قناة {id}", en: "Channel {id}" },

  // ─── Broadcast ───
  broadcastPrompt: {
    ar: "📢 *رسالة جماعية*\n\nسيتم إرسالها لـ *{n}* مشترك نشط.\n\nأرسل الرسالة الآن (نص، صورة، فيديو...):\n\n_أرسل /cancel للإلغاء_",
    en: "📢 *Broadcast*\n\nWill be sent to *{n}* active subscribers.\n\nSend the message now (text, photo, video...):\n\n_Send /cancel to cancel_",
  },
  broadcastDone: {
    ar: "📢 *تم الإرسال!*\n\n✅ نجح: *{sent}*\n❌ فشل: *{failed}*\n📊 الإجمالي: {total}",
    en: "📢 *Sent!*\n\n✅ Success: *{sent}*\n❌ Failed: *{failed}*\n📊 Total: {total}",
  },

  // ─── Search & Delete ───
  searchPrompt: {
    ar: "🔍 *بحث عن مشترك*\n\nأرسل الـ ID أو @username:\n\n_أرسل /cancel للإلغاء_",
    en: "🔍 *Search Subscriber*\n\nSend the ID or @username:\n\n_Send /cancel to cancel_",
  },
  searchResult: {
    ar: "🔍 *نتيجة البحث:*\n\n🆔 `{id}`\n{uname}📋 {status}{ch}\n📅 أضيف: {created}",
    en: "🔍 *Search result:*\n\n🆔 `{id}`\n{uname}📋 {status}{ch}\n📅 Added: {created}",
  },
  searchNoResult: { ar: "❌ لم يتم العثور على مشترك.", en: "❌ No subscriber found." },
  deletePrompt: {
    ar: "🗑 *حذف مشترك*\n\nأرسل الـ ID الرقمي للمشترك:\n\n⚠️ سيتم طرده من القنوات نهائياً.\n\n_أرسل /cancel للإلغاء_",
    en: "🗑 *Delete Subscriber*\n\nSend the numeric ID:\n\n⚠️ They will be kicked permanently.\n\n_Send /cancel to cancel_",
  },
  sendIdOnly: { ar: "❌ أرسل رقم ID فقط.", en: "❌ Send the numeric ID only." },
  subNotFound: { ar: "❌ المشترك غير موجود.", en: "❌ Subscriber not found." },
  subDeleted: {
    ar: "✅ *تم حذف المشترك* `{id}`\n🚫 طُرد من *{n}* قناة",
    en: "✅ *Subscriber deleted* `{id}`\n🚫 Kicked from *{n}* channel(s)",
  },
  subDeletedShort: {
    ar: "✅ *تم حذف* `{id}` — طُرد من *{n}* قناة",
    en: "✅ *Deleted* `{id}` — kicked from *{n}* channel(s)",
  },
  subscriptionCancelled: {
    ar: "⚠️ تم إلغاء اشتراكك وإزالتك من القنوات.",
    en: "⚠️ Your subscription was cancelled and you were removed from the channels.",
  },
  channelsAll: { ar: "\n📺 القنوات: جميع القنوات", en: "\n📺 Channels: all channels" },
  channelsList2: { ar: "\n📺 القنوات: {list}", en: "\n📺 Channels: {list}" },
  channelsSep: { ar: "، ", en: ", " },
  statusActiveDays: {
    ar: "✅ نشط ({n} يوم)\n📅 ينتهي: {date}",
    en: "✅ Active ({n} days)\n📅 Expires: {date}",
  },
  statusActiveCompact: { ar: "✅ نشط ({n} يوم)", en: "✅ Active ({n}d)" },
  statusExpiredCompact: { ar: "❌ منتهي", en: "❌ Expired" },
  statusExpiredSince: { ar: "❌ منتهي منذ {date}", en: "❌ Expired since {date}" },

  // ─── Stats ───
  stats: {
    ar: "📊 *الإحصائيات:*\n\n👥 *المشتركين:*\n├ إجمالي: *{total}*\n├ ✅ نشطون: *{active}*\n├ ♾ دائمون: *{perm}*\n├ ❌ منتهيون: *{expired}*\n└ ⚠️ ينتهي خلال 3 أيام: *{soon}*\n\n📺 *القنوات:* {ch}",
    en: "📊 *Statistics:*\n\n👥 *Subscribers:*\n├ Total: *{total}*\n├ ✅ Active: *{active}*\n├ ♾ Permanent: *{perm}*\n├ ❌ Expired: *{expired}*\n└ ⚠️ Expiring in 3 days: *{soon}*\n\n📺 *Channels:* {ch}",
  },

  // ─── My subscription (detailed) ───
  mySubDetail: {
    ar: "📋 *اشتراكك:*\n\n{status}{ch}\n📅 تاريخ الاشتراك: {date}",
    en: "📋 *Your subscription:*\n\n{status}{ch}\n📅 Subscribed on: {date}",
  },
  myStatusActive: {
    ar: "✅ *نشط*\n📅 ينتهي: {date}\n⏳ متبقي: *{n}* يوم",
    en: "✅ *Active*\n📅 Expires: {date}\n⏳ Left: *{n}* days",
  },

  // ─── Free trial ───
  trialUnavailable: { ar: "❌ التجربة المجانية غير متاحة حالياً.", en: "❌ Free trial is not available." },
  trialUsed: {
    ar: "⚠️ لقد استخدمت التجربة المجانية مسبقاً. لا يمكن الاستفادة أكثر من مرة.",
    en: "⚠️ You've already used the free trial. It can't be used again.",
  },
};

export function t(key: keyof typeof M, lang: Lang, vars?: V): string {
  const entry = M[key];
  if (!entry) return key as string;
  return fill(entry[lang], vars);
}

// Format date according to language
export function fmtDate(dateStr: string, lang: Lang): string {
  const locale = lang === "en" ? "en-US" : "ar-EG";
  return new Date(dateStr).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Admin keyboard localized
export function adminKb(lang: Lang) {
  return {
    inline_keyboard: [
      [
        { text: t("btnAddSub", lang), callback_data: "add_subscriber" },
        { text: t("btnListSubs", lang), callback_data: "list_subscribers" },
      ],
      [
        { text: t("btnAddCh", lang), callback_data: "add_channel" },
        { text: t("btnManageCh", lang), callback_data: "manage_channels" },
      ],
      [
        { text: t("btnBroadcast", lang), callback_data: "broadcast" },
        { text: t("btnStats", lang), callback_data: "stats" },
      ],
      [
        { text: t("btnSearch", lang), callback_data: "search_subscriber" },
        { text: t("btnDelSub", lang), callback_data: "delete_subscriber" },
      ],
      [
        { text: t("langButton", lang), callback_data: "change_language" },
      ],
    ],
  };
}

export function langPickerKb() {
  return {
    inline_keyboard: [[
      { text: "🇸🇦 العربية", callback_data: "set_lang_ar" },
      { text: "🇬🇧 English", callback_data: "set_lang_en" },
    ]],
  };
}
