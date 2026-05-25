// Lightweight i18n for the telegram bot — user-facing strings only (Phase 1)
export type Lang = "ar" | "en";

type Dict = Record<string, string | ((p: any) => string)>;

const ar: Dict = {
  pick_lang: "🌐 الرجاء اختيار لغتك / Please choose your language",
  lang_saved: "✅ تم حفظ اللغة: العربية",
  btn_my_sub: "ℹ️ حالة اشتراكي",
  btn_free_trial: (p: { days: number }) =>
    `🎁 تجربة مجانية (${p.days} ${p.days === 1 ? "يوم" : "أيام"})`,
  mandatory_required: (p: { name: string }) =>
    `⚠️ مرحباً *${p.name}*!\n\n🔒 يجب عليك الانضمام إلى القناة الإجبارية أولاً قبل الوصول إلى القنوات.\n\nانضم ثم اضغط /start مرة أخرى.`,
  mandatory_required_short:
    `⚠️ يجب عليك الانضمام إلى القناة الإجبارية أولاً.\n\nانضم ثم اضغط /start مرة أخرى.`,
  sub_active_header: (p: { name: string; status: string }) =>
    `مرحباً *${p.name}*! 👋\n\n✅ أنت مشترك\n${p.status}\n\n📺 اضغط على القنوات للانضمام:`,
  status_permanent: "♾ *دائم*",
  status_remaining: (p: { days: number; date: string }) =>
    `📅 متبقي *${p.days}* يوم (حتى ${p.date})`,
  sub_expired: (p: { name: string; date: string }) =>
    `⏰ مرحباً *${p.name}*\n\nللأسف اشتراكك *منتهي* منذ ${p.date}.\n\nتواصل مع المسؤول لتجديد اشتراكك.`,
  id_info: (p: { id: number; name: string; username: string | null }) =>
    `🆔 معرفك: \`${p.id}\`\n👤 الاسم: ${p.name}${p.username ? `\n📛 المعرف: @${p.username}` : ""}`,
  cancelled: "❌ تم الإلغاء.",
  trial_unavailable: "❌ التجربة المجانية غير متاحة حالياً.",
  trial_already_used: "⚠️ لقد استخدمت التجربة المجانية مسبقاً. لا يمكن الاستفادة أكثر من مرة.",
  my_sub_card: (p: { status: string; channels: string; date: string }) =>
    `📋 *اشتراكك:*\n\n${p.status}${p.channels}\n📅 تاريخ الاشتراك: ${p.date}`,
  my_sub_status_active: (p: { date: string; days: number }) =>
    `✅ *نشط*\n📅 ينتهي: ${p.date}\n⏳ متبقي: *${p.days}* يوم`,
  my_sub_status_expired: (p: { date: string }) => `❌ *منتهي* منذ ${p.date}`,
  my_sub_channels: (p: { list: string }) => `\n📺 القنوات: ${p.list}`,
};

const en: Dict = {
  pick_lang: "🌐 Please choose your language / الرجاء اختيار لغتك",
  lang_saved: "✅ Language saved: English",
  btn_my_sub: "ℹ️ My Subscription",
  btn_free_trial: (p: { days: number }) =>
    `🎁 Free trial (${p.days} ${p.days === 1 ? "day" : "days"})`,
  mandatory_required: (p: { name: string }) =>
    `⚠️ Hi *${p.name}*!\n\n🔒 You must join the mandatory channel first before accessing other channels.\n\nJoin it then press /start again.`,
  mandatory_required_short:
    `⚠️ You must join the mandatory channel first.\n\nJoin it then press /start again.`,
  sub_active_header: (p: { name: string; status: string }) =>
    `Hi *${p.name}*! 👋\n\n✅ You are subscribed\n${p.status}\n\n📺 Tap a channel to join:`,
  status_permanent: "♾ *Permanent*",
  status_remaining: (p: { days: number; date: string }) =>
    `📅 *${p.days}* day(s) remaining (until ${p.date})`,
  sub_expired: (p: { name: string; date: string }) =>
    `⏰ Hi *${p.name}*\n\nUnfortunately your subscription *expired* on ${p.date}.\n\nContact the admin to renew it.`,
  id_info: (p: { id: number; name: string; username: string | null }) =>
    `🆔 Your ID: \`${p.id}\`\n👤 Name: ${p.name}${p.username ? `\n📛 Username: @${p.username}` : ""}`,
  cancelled: "❌ Cancelled.",
  trial_unavailable: "❌ Free trial is not available right now.",
  trial_already_used: "⚠️ You have already used the free trial. It cannot be used again.",
  my_sub_card: (p: { status: string; channels: string; date: string }) =>
    `📋 *Your Subscription:*\n\n${p.status}${p.channels}\n📅 Started on: ${p.date}`,
  my_sub_status_active: (p: { date: string; days: number }) =>
    `✅ *Active*\n📅 Expires: ${p.date}\n⏳ Remaining: *${p.days}* day(s)`,
  my_sub_status_expired: (p: { date: string }) => `❌ *Expired* on ${p.date}`,
  my_sub_channels: (p: { list: string }) => `\n📺 Channels: ${p.list}`,
};

const dicts: Record<Lang, Dict> = { ar, en };

export function t(lang: Lang, key: string, params?: any): string {
  const entry = dicts[lang]?.[key] ?? dicts.ar[key] ?? key;
  return typeof entry === "function" ? entry(params || {}) : entry;
}

export function langPickerKeyboard() {
  return {
    inline_keyboard: [[
      { text: "🇸🇦 العربية", callback_data: "set_lang_ar" },
      { text: "🇬🇧 English", callback_data: "set_lang_en" },
    ]],
  };
}
