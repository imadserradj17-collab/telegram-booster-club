import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  "dash.publicChannel": { ar: "قناة/مجموعة عامة", en: "Public Channel/Group" },
  "dash.publicChannelHint": { ar: "ستظهر لجميع الأشخاص (حتى غير المشتركين)", en: "Will be shown to everyone (even non-subscribers)" },
  "dash.publicMembers": { ar: "أعضاء القناة المجانية", en: "Free channel members" },
  "dash.kickAllPublic": { ar: "طرد الجميع من القناة المجانية", en: "Kick all from free channel" },
  "dash.kickAllPublicConfirm": { ar: "هل تريد طرد جميع الأعضاء المجانيين من القناة العامة؟", en: "Kick all free members from the public channel?" },
  "dash.kickAllPublicDone": { ar: "تم طرد الأعضاء المجانيين", en: "Free members kicked" },
  "dash.noPublicChannel": { ar: "لم يتم تحديد قناة عامة", en: "No public channel configured" },
  "dash.publicChannelNone": { ar: "بدون قناة عامة", en: "No public channel" },
  "dash.subscribersChannel": { ar: "قناة/مجموعة المشتركين", en: "Subscribers Channel/Group" },
  "dash.subscribersChannelHint": { ar: "تظهر لجميع المشتركين النشطين فقط (مثل مجموعة نقاش)", en: "Shown to active subscribers only (e.g. discussion group)" },
  "dash.subscribersChannelNone": { ar: "بدون قناة مشتركين", en: "No subscribers channel" },
  "dash.tokenChanged": { ar: "تم تغيير التوكن وتحديث الويب هوك ✅", en: "Token changed and webhook updated ✅" },
  "dash.settingsSaved": { ar: "تم حفظ الإعدادات ✅", en: "Settings saved ✅" },
  "dash.subscriberDeleted": { ar: "تم حذف المشترك", en: "Subscriber deleted" },
  "dash.collapseMenu": { ar: "طي القائمة", en: "Collapse Menu" },
  "dash.adminPanel": { ar: "لوحة الأدمن", en: "Admin Panel" },
  "dash.dayAndHour": { ar: "يوم و", en: "day(s) and" },
  "dash.hour": { ar: "ساعة", en: "hour(s)" },
  "dash.andMinute": { ar: "و", en: "and" },
  "dash.minute": { ar: "دقيقة", en: "minute(s)" },

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

  // Channels
  "channels.title": { ar: "القنوات والمجموعات", en: "Channels & Groups" },
  "channels.add": { ar: "إضافة قناة/مجموعة", en: "Add Channel/Group" },
  "channels.name": { ar: "الاسم", en: "Name" },
  "channels.channelId": { ar: "المعرف", en: "ID" },
  "channels.inviteLink": { ar: "رابط الدعوة", en: "Invite Link" },
  "channels.noChannels": { ar: "لا توجد قنوات أو مجموعات", en: "No channels or groups" },
  "channels.delete": { ar: "حذف", en: "Delete" },
  "channels.deleteConfirm": { ar: "هل أنت متأكد من الحذف؟", en: "Are you sure you want to delete?" },
  "channels.deleted": { ar: "تم الحذف", en: "Deleted" },
  "channels.subsCount": { ar: "عدد المشتركين", en: "Subscribers" },
  "channels.addedAt": { ar: "تاريخ الإضافة", en: "Added" },
  "channels.channel": { ar: "قناة", en: "Channel" },
  "channels.group": { ar: "مجموعة", en: "Group" },

  // Subscriber management
  "subs.add": { ar: "إضافة مشترك", en: "Add Subscriber" },
  "subs.telegramId": { ar: "معرف تلغرام", en: "Telegram ID" },
  "subs.username": { ar: "اسم المستخدم", en: "Username" },
  "subs.firstName": { ar: "الاسم الأول", en: "First Name" },
  "subs.lastName": { ar: "اسم العائلة", en: "Last Name" },
  "subs.selectDuration": { ar: "مدة الاشتراك", en: "Duration" },
  "subs.selectChannels": { ar: "اختر القنوات", en: "Select Channels" },
  "subs.allChannels": { ar: "جميع القنوات", en: "All Channels" },
  "subs.added": { ar: "تم إضافة المشترك بنجاح", en: "Subscriber added successfully" },
  "subs.permanentOption": { ar: "دائم", en: "Permanent" },
  "subs.customDays": { ar: "عدد أيام مخصص", en: "Custom days" },
  "subs.assignedChannels": { ar: "القنوات المخصصة", en: "Assigned Channels" },
  "subs.allAssigned": { ar: "جميع القنوات", en: "All Channels" },
  "subs.editChannels": { ar: "تعديل القنوات", en: "Edit Channels" },
  "subs.channelsSaved": { ar: "تم حفظ القنوات", en: "Channels saved" },
  "subs.kickAll": { ar: "طرد من كل القنوات", en: "Kick from all channels" },
  "subs.kickConfirm": { ar: "هل تريد طرد هذا المشترك من جميع القنوات المخصصة؟", en: "Kick this subscriber from all assigned channels?" },
  "subs.deleteConfirm": { ar: "هل تريد حذف هذا المشترك وطرده من جميع القنوات والمجموعات؟", en: "Delete this subscriber and kick from all channels/groups?" },
  "subs.kickBeforeDeleteFailed": { ar: "فشل طرد المشترك من القنوات/المجموعات، لذلك تم إيقاف الحذف.", en: "Failed to kick subscriber from channels/groups, so deletion was stopped." },
  "subs.kicked": { ar: "تم الطرد", en: "Kicked" },
  "subs.searchChannels": { ar: "بحث عن قناة...", en: "Search channels..." },

  // Broadcast
  "broadcast.title": { ar: "البث", en: "Broadcast" },
  "broadcast.send": { ar: "إرسال", en: "Send" },
  "broadcast.message": { ar: "نص الرسالة", en: "Message text" },
  "broadcast.placeholder": { ar: "اكتب رسالتك هنا...", en: "Type your message here..." },
  "broadcast.sending": { ar: "جاري الإرسال...", en: "Sending..." },
  "broadcast.sent": { ar: "تم الإرسال", en: "Sent" },
  "broadcast.result": { ar: "نتيجة البث", en: "Broadcast Result" },
  "broadcast.success": { ar: "نجح", en: "Succeeded" },
  "broadcast.failed": { ar: "فشل", en: "Failed" },
  "broadcast.total": { ar: "الإجمالي", en: "Total" },
  "broadcast.targetAll": { ar: "جميع المشتركين النشطين", en: "All active subscribers" },
  "broadcast.toAllUsers": { ar: "إرسال لجميع مستخدمي البوت", en: "Broadcast to all bot users" },
  "broadcast.targetAllUsers": { ar: "جميع من بدأ البوت", en: "All users who started the bot" },
  "broadcast.subsOnly": { ar: "المشتركين النشطين فقط", en: "Active subscribers only" },
  "broadcast.allBotUsers": { ar: "جميع مستخدمي البوت", en: "All bot users" },
  "broadcast.botUsersCount": { ar: "مستخدمي البوت", en: "Bot users" },

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
  "admin.searchEmail": { ar: "بحث بالإيميل...", en: "Search by email..." },
  "admin.all": { ar: "الكل", en: "All" },
  "admin.filterPending": { ar: "معلّق", en: "Pending" },
  "admin.filterActive": { ar: "مفعّل", en: "Active" },
  "admin.filterExpired": { ar: "منتهي", en: "Expired" },
  "admin.totalUsers": { ar: "إجمالي المستخدمين", en: "Total Users" },
  "admin.expiredCount": { ar: "منتهي", en: "Expired" },
  "admin.bulkActivate": { ar: "تفعيل المحددين", en: "Activate Selected" },
  "admin.bulkDeactivate": { ar: "تعطيل المحددين", en: "Deactivate Selected" },
  "admin.selected": { ar: "محدد", en: "selected" },
  "admin.selectAll": { ar: "تحديد الكل", en: "Select All" },
  "admin.bulkDays": { ar: "أيام التفعيل الجماعي", en: "Bulk activation days" },
  "admin.noResults": { ar: "لا توجد نتائج", en: "No results found" },
  "admin.refresh": { ar: "تحديث", en: "Refresh" },

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
  const [userId, setUserId] = useState<string | null>(null);

  // Load language preference from DB when user logs in
  useEffect(() => {
    const loadUserLang = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        const { data } = await supabase
          .from("profiles")
          .select("preferred_language")
          .eq("id", session.user.id)
          .maybeSingle();
        if (data?.preferred_language && (data.preferred_language === "ar" || data.preferred_language === "en")) {
          setLangState(data.preferred_language as Lang);
          localStorage.setItem("app_lang", data.preferred_language);
        }
      }
    };
    loadUserLang();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        supabase.from("profiles").select("preferred_language").eq("id", session.user.id).maybeSingle()
          .then(({ data }) => {
            if (data?.preferred_language && (data.preferred_language === "ar" || data.preferred_language === "en")) {
              setLangState(data.preferred_language as Lang);
              localStorage.setItem("app_lang", data.preferred_language);
            }
          });
      } else {
        setUserId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("app_lang", newLang);
    // Save to DB if logged in
    if (userId) {
      supabase.rpc("update_preferred_language", { _lang: newLang }).then();
    }
  }, [userId]);

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
