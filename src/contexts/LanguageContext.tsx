import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Lang = "ar" | "en";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const translations: Record<string, Record<Lang, string>> = {
  // Auth
  "auth.title": { ar: "إدارة اشتراك قنوات تلغرام", en: "Telegram Channel Subscription Manager" },
  "auth.loginSubtitle": { ar: "سجّل دخولك للمتابعة", en: "Sign in to continue" },
  "auth.signupSubtitle": { ar: "أنشئ حسابك الجديد", en: "Create your new account" },
  "auth.email": { ar: "البريد الإلكتروني", en: "Email" },
  "auth.password": { ar: "كلمة المرور", en: "Password" },
  "auth.login": { ar: "تسجيل الدخول", en: "Sign In" },
  "auth.signup": { ar: "إنشاء حساب", en: "Sign Up" },
  "auth.noAccount": { ar: "ليس لديك حساب؟ أنشئ حساباً جديداً", en: "Don't have an account? Sign up" },
  "auth.hasAccount": { ar: "لديك حساب بالفعل؟ سجّل دخولك", en: "Already have an account? Sign in" },
  "auth.loginSuccess": { ar: "تم تسجيل الدخول بنجاح", en: "Logged in successfully" },
  "auth.signupSuccess": { ar: "تم إنشاء الحساب بنجاح", en: "Account created successfully" },
  "auth.error": { ar: "خطأ", en: "Error" },

  // Pending Approval
  "pending.title": { ar: "في انتظار الموافقة", en: "Pending Approval" },
  "pending.desc": { ar: "تم إنشاء حسابك بنجاح. يرجى الانتظار حتى يتم تفعيل حسابك من قبل الأدمن.", en: "Your account has been created successfully. Please wait for admin activation." },

  // Bot Setup
  "bot.title": { ar: "إعداد بوت تلغرام", en: "Telegram Bot Setup" },
  "bot.done": { ar: "تم التفعيل! 🎉", en: "Activated! 🎉" },
  "bot.activating": { ar: "جاري تفعيل البوت وربط الويب هوك...", en: "Activating bot and setting up webhook..." },
  "bot.ready": { ar: "البوت جاهز للعمل", en: "Bot is ready" },
  "bot.desc": { ar: "أدخل توكن البوت الخاص بك للبدء في إدارة الاشتراكات", en: "Enter your bot token to start managing subscriptions" },
  "bot.howToGet": { ar: "كيف أحصل على التوكن؟", en: "How to get the token?" },
  "bot.step1": { ar: "افتح تلغرام وابحث عن @BotFather", en: "Open Telegram and search for @BotFather" },
  "bot.step2": { ar: "أرسل الأمر /newbot", en: "Send the /newbot command" },
  "bot.step3": { ar: "اتبع التعليمات وأنشئ بوتاً جديداً", en: "Follow instructions and create a new bot" },
  "bot.step4": { ar: "انسخ التوكن الذي ستحصل عليه", en: "Copy the token you receive" },
  "bot.tokenLabel": { ar: "توكن البوت", en: "Bot Token" },
  "bot.activate": { ar: "تفعيل البوت", en: "Activate Bot" },
  "bot.activatingStatus": { ar: "جاري التفعيل...", en: "Activating..." },
  "bot.redirecting": { ar: "سيتم نقلك للوحة التحكم...", en: "Redirecting to dashboard..." },
  "bot.success": { ar: "تم تفعيل البوت بنجاح! 🤖✅", en: "Bot activated successfully! 🤖✅" },
  "bot.notLoggedIn": { ar: "غير مسجل الدخول", en: "Not logged in" },
  "bot.webhookFailed": { ar: "فشل تفعيل الويب هوك", en: "Webhook activation failed" },

  // Dashboard
  "dash.subMgmt": { ar: "إدارة الاشتراكات", en: "Subscription Manager" },
  "dash.overview": { ar: "نظرة عامة", en: "Overview" },
  "dash.subscribers": { ar: "المشتركون", en: "Subscribers" },
  "dash.expired": { ar: "المنتهيون", en: "Expired" },
  "dash.analytics": { ar: "التحليلات", en: "Analytics" },
  "dash.settings": { ar: "الإعدادات", en: "Settings" },
  "dash.totalSubs": { ar: "إجمالي المشتركين", en: "Total Subscribers" },
  "dash.active": { ar: "نشط", en: "Active" },
  "dash.expiredLabel": { ar: "منتهي", en: "Expired" },
  "dash.permanent": { ar: "دائم", en: "Permanent" },
  "dash.warning": { ar: "مشترك سينتهي اشتراكهم خلال 3 أيام", en: "subscriber(s) expiring within 3 days" },
  "dash.autoWarning": { ar: "يُرسل تحذير تلقائي قبل 24 ساعة من الانتهاء", en: "Automatic warning sent 24 hours before expiration" },
  "dash.show": { ar: "عرض", en: "View" },
  "dash.latestSubs": { ar: "آخر المشتركين", en: "Latest Subscribers" },
  "dash.noSubs": { ar: "لا يوجد مشتركون", en: "No subscribers" },
  "dash.subscriber": { ar: "المشترك", en: "Subscriber" },
  "dash.id": { ar: "المعرف", en: "ID" },
  "dash.status": { ar: "الحالة", en: "Status" },
  "dash.duration": { ar: "المدة", en: "Duration" },
  "dash.subDate": { ar: "تاريخ الاشتراك", en: "Sub Date" },
  "dash.user": { ar: "مستخدم", en: "User" },
  "dash.daysLeft": { ar: "يوم متبقي", en: "days left" },
  "dash.expiredOn": { ar: "انتهى", en: "Expired" },
  "dash.permanentBadge": { ar: "♾ دائم", en: "♾ Permanent" },
  "dash.activeBadge": { ar: "نشط", en: "Active" },
  "dash.expiredBadge": { ar: "منتهي", en: "Expired" },
  "dash.day": { ar: "يوم", en: "day(s)" },
  "dash.searchPlaceholder": { ar: "بحث بالاسم أو المعرف...", en: "Search by name or ID..." },
  "dash.activeCount": { ar: "مشترك نشط", en: "active subscriber(s)" },
  "dash.expiredCount": { ar: "مشترك منتهي", en: "expired subscriber(s)" },
  "dash.changeToken": { ar: "تغيير توكن البوت", en: "Change Bot Token" },
  "dash.cantChangeToken": { ar: "لا يمكن تغيير التوكن إلا بعد", en: "Token can only be changed after" },
  "dash.newToken": { ar: "التوكن الجديد", en: "New Token" },
  "dash.enterNewToken": { ar: "أدخل التوكن الجديد...", en: "Enter new token..." },
  "dash.changeTokenBtn": { ar: "تغيير التوكن", en: "Change Token" },
  "dash.lastChange": { ar: "آخر تغيير:", en: "Last changed:" },
  "dash.adminSettings": { ar: "إعدادات الأدمن", en: "Admin Settings" },
  "dash.adminId": { ar: "معرف الأدمن (Telegram ID)", en: "Admin ID (Telegram ID)" },
  "dash.adminIdHint": { ar: "فقط هذا المعرف يمكنه التحكم بالبوت. اتركه فارغاً للسماح للجميع.", en: "Only this ID can control the bot. Leave empty to allow everyone." },
  "dash.nonSubMsg": { ar: "رسالة غير المشتركين", en: "Non-subscriber Message" },
  "dash.nonSubMsgPlaceholder": { ar: "الرسالة التي تظهر لغير المشتركين...", en: "Message shown to non-subscribers..." },
  "dash.saveSettings": { ar: "حفظ الإعدادات", en: "Save Settings" },
  "dash.tokenChanged": { ar: "تم تغيير التوكن وتحديث الويب هوك ✅", en: "Token changed and webhook updated ✅" },
  "dash.settingsSaved": { ar: "تم حفظ الإعدادات ✅", en: "Settings saved ✅" },
  "dash.subscriberDeleted": { ar: "تم حذف المشترك", en: "Subscriber deleted" },
  "dash.collapseMenu": { ar: "طي القائمة", en: "Collapse Menu" },
  "dash.adminPanel": { ar: "لوحة الأدمن", en: "Admin Panel" },
  "dash.dayAndHour": { ar: "يوم و", en: "day(s) and" },
  "dash.hour": { ar: "ساعة", en: "hour(s)" },

  // Analytics
  "analytics.title": { ar: "تحليلات الاشتراكات", en: "Subscription Analytics" },
  "analytics.newSubs": { ar: "اشتراكات جديدة", en: "New Subscriptions" },
  "analytics.expirations": { ar: "انتهاءات", en: "Expirations" },
  "analytics.activeSubs": { ar: "المشتركون النشطون", en: "Active Subscribers" },
  "analytics.subsByStatus": { ar: "توزيع الحالة", en: "Status Distribution" },
  "analytics.last30Days": { ar: "آخر 30 يوم", en: "Last 30 Days" },
  "analytics.renewalRate": { ar: "معدل التجديد", en: "Renewal Rate" },
  "analytics.avgDuration": { ar: "متوسط المدة", en: "Avg Duration" },
  "analytics.expiringSoon": { ar: "ينتهي قريباً", en: "Expiring Soon" },
  "analytics.count": { ar: "العدد", en: "Count" },
  "analytics.date": { ar: "التاريخ", en: "Date" },

  // Admin
  "admin.title": { ar: "لوحة الأدمن", en: "Admin Panel" },
  "admin.dashboard": { ar: "لوحة التحكم", en: "Dashboard" },
  "admin.pendingApproval": { ar: "في انتظار الموافقة", en: "Pending Approval" },
  "admin.activated": { ar: "مفعّل", en: "Activated" },
  "admin.email": { ar: "البريد الإلكتروني", en: "Email" },
  "admin.regDate": { ar: "تاريخ التسجيل", en: "Registration Date" },
  "admin.status": { ar: "الحالة", en: "Status" },
  "admin.remaining": { ar: "المدة المتبقية", en: "Remaining" },
  "admin.action": { ar: "إجراء", en: "Action" },
  "admin.expired": { ar: "منتهي", en: "Expired" },
  "admin.active": { ar: "مفعّل", en: "Active" },
  "admin.pending": { ar: "معلّق", en: "Pending" },
  "admin.daysCount": { ar: "يوم", en: "day(s)" },
  "admin.daysPlaceholder": { ar: "عدد الأيام", en: "Days" },
  "admin.activate": { ar: "تفعيل", en: "Activate" },
  "admin.deactivate": { ar: "تعطيل", en: "Deactivate" },
  "admin.invalidDays": { ar: "أدخل عدد أيام صحيح", en: "Enter a valid number of days" },
  "admin.activatedMsg": { ar: "تم تفعيل الحساب لمدة", en: "Account activated for" },
  "admin.deactivatedMsg": { ar: "تم تعطيل الحساب ❌", en: "Account deactivated ❌" },

  // Common
  "common.logout": { ar: "تسجيل الخروج", en: "Sign Out" },
  "common.error": { ar: "خطأ", en: "Error" },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("app_lang");
    return (saved === "en" || saved === "ar") ? saved : "ar";
  });

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("app_lang", newLang);
  };

  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: string): string => {
    return translations[key]?.[lang] || key;
  };

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
};
