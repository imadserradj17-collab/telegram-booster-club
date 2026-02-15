import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  LogOut, Trash2, RefreshCw, Users, Zap, Bot, UserPlus, Clock,
  Settings, Key, Shield, MessageSquare, Save, Loader2, User, Calendar, Hash,
} from "lucide-react";

interface TelegramSubscriber {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  subscription_days: number | null;
  expires_at: string | null;
  is_permanent: boolean;
  created_at: string;
}

interface BotSettings {
  id: string;
  token: string;
  token_updated_at: string;
  admin_telegram_id: number | null;
  non_subscriber_message: string;
}

const Dashboard = () => {
  const [subscribers, setSubscribers] = useState<TelegramSubscriber[]>([]);
  const [botSettings, setBotSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"subscribers" | "settings">("subscribers");

  // Settings form state
  const [newToken, setNewToken] = useState("");
  const [adminId, setAdminId] = useState("");
  const [nonSubMessage, setNonSubMessage] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [subsRes, settingsRes] = await Promise.all([
      supabase.from("telegram_subscribers").select("*").order("created_at", { ascending: false }),
      supabase.from("bot_tokens").select("*").maybeSingle(),
    ]);

    if (subsRes.data) setSubscribers(subsRes.data);
    if (settingsRes.data) {
      setBotSettings(settingsRes.data as BotSettings);
      setAdminId(settingsRes.data.admin_telegram_id?.toString() || "");
      setNonSubMessage(settingsRes.data.non_subscriber_message || "");
    }
    setLoading(false);
  };

  const canChangeToken = () => {
    if (!botSettings?.token_updated_at) return true;
    const lastUpdate = new Date(botSettings.token_updated_at);
    const threeDaysLater = new Date(lastUpdate.getTime() + 3 * 24 * 60 * 60 * 1000);
    return new Date() >= threeDaysLater;
  };

  const getTokenCooldownRemaining = () => {
    if (!botSettings?.token_updated_at) return "";
    const lastUpdate = new Date(botSettings.token_updated_at);
    const threeDaysLater = new Date(lastUpdate.getTime() + 3 * 24 * 60 * 60 * 1000);
    const diff = threeDaysLater.getTime() - Date.now();
    if (diff <= 0) return "";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return `${days} يوم و ${hours} ساعة`;
  };

  const handleChangeToken = async () => {
    if (!newToken.trim() || !canChangeToken()) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from("bot_tokens")
        .update({ token: newToken.trim(), token_updated_at: new Date().toISOString() })
        .eq("id", botSettings!.id);
      if (error) throw error;
      const { error: webhookErr } = await supabase.functions.invoke("telegram-bot", {
        body: { action: "setup_webhook", bot_token: newToken.trim() },
      });
      if (webhookErr) throw webhookErr;
      toast({ title: "تم تغيير التوكن وتحديث الويب هوك ✅" });
      setNewToken("");
      fetchData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!botSettings) return;
    setSavingSettings(true);
    try {
      const updates: any = { non_subscriber_message: nonSubMessage.trim() };
      updates.admin_telegram_id = adminId.trim() ? parseInt(adminId.trim()) : null;
      const { error } = await supabase.from("bot_tokens").update(updates).eq("id", botSettings.id);
      if (error) throw error;
      toast({ title: "تم حفظ الإعدادات ✅" });
      fetchData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const deleteSubscriber = async (id: string) => {
    const { error } = await supabase.from("telegram_subscribers").delete().eq("id", id);
    if (!error) {
      setSubscribers((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "تم حذف المشترك" });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isExpired = (sub: TelegramSubscriber) =>
    !sub.is_permanent && sub.expires_at && new Date(sub.expires_at) < new Date();

  const daysRemaining = (expiresAt: string) =>
    Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));

  const getDisplayName = (sub: TelegramSubscriber) => {
    const parts = [sub.first_name, sub.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  };

  const activeCount = subscribers.filter((s) => !isExpired(s)).length;
  const expiredCount = subscribers.filter((s) => isExpired(s)).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-telegram flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">إدارة اشتراكات تلغرام</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="w-4 h-4 ml-2" />
            خروج
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: Users, label: "المشتركون", value: subscribers.length },
            { icon: Zap, label: "نشط", value: activeCount },
            { icon: Clock, label: "منتهي", value: expiredCount },
          ].map(({ icon: Icon, label, value }, i) => (
            <div key={i} className="glass-card p-3 text-center">
              <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {([
            { key: "subscribers", icon: Users, label: "المشتركون" },
            { key: "settings", icon: Settings, label: "الإعدادات" },
          ] as const).map(({ key, icon: Icon, label }) => (
            <Button
              key={key}
              variant={activeTab === key ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(key)}
              className={activeTab === key ? "gradient-telegram text-primary-foreground" : "text-muted-foreground"}
            >
              <Icon className="w-4 h-4 ml-1" />
              {label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={fetchData} className="text-muted-foreground mr-auto">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Subscribers Tab */}
        {activeTab === "subscribers" && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              </div>
            ) : subscribers.length === 0 ? (
              <div className="text-center py-12 glass-card">
                <UserPlus className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">لا يوجد مشتركون</p>
                <p className="text-xs text-muted-foreground/60 mt-1">أضف المشتركين عبر البوت في تلغرام</p>
              </div>
            ) : (
              subscribers.map((sub, i) => {
                const expired = isExpired(sub);
                const displayName = getDisplayName(sub);
                const remaining = sub.expires_at ? daysRemaining(sub.expires_at) : null;

                return (
                  <div key={sub.id} className="glass-card p-4 animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {sub.photo_url ? (
                          <img
                            src={sub.photo_url}
                            alt={displayName || "User"}
                            className="w-12 h-12 rounded-full object-cover border-2 border-border/50"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                            }}
                          />
                        ) : null}
                        <div className={`w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center ${sub.photo_url ? "hidden" : ""}`}>
                          <User className="w-6 h-6 text-primary/60" />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-foreground truncate">
                            {displayName || `مستخدم ${sub.telegram_user_id}`}
                          </p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            expired ? "bg-destructive/20 text-destructive" : "bg-success/20 text-success"
                          }`}>
                            {expired ? "منتهي" : sub.is_permanent ? "♾ دائم" : "نشط"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Hash className="w-3 h-3 flex-shrink-0" />
                            <span className="font-mono" dir="ltr">{sub.telegram_user_id}</span>
                          </div>

                          {sub.telegram_username && (
                            <div className="flex items-center gap-1.5">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span dir="ltr">@{sub.telegram_username}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span>اشترك: {new Date(sub.created_at).toLocaleDateString("ar-SA")}</span>
                          </div>

                          {sub.is_permanent ? (
                            <div className="flex items-center gap-1.5 text-primary">
                              <Zap className="w-3 h-3 flex-shrink-0" />
                              <span>اشتراك دائم</span>
                            </div>
                          ) : sub.expires_at ? (
                            <div className={`flex items-center gap-1.5 ${expired ? "text-destructive" : remaining! <= 3 ? "text-yellow-500" : ""}`}>
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              <span>
                                {expired
                                  ? `انتهى ${new Date(sub.expires_at).toLocaleDateString("ar-SA")}`
                                  : `متبقي ${remaining} يوم`}
                              </span>
                            </div>
                          ) : null}

                          {sub.subscription_days && !sub.is_permanent && (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              <span>مدة: {sub.subscription_days} يوم</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSubscriber(sub.id)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* Change Token */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">تغيير توكن البوت</h3>
              </div>

              {!canChangeToken() && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                  ⏳ لا يمكن تغيير التوكن إلا بعد <strong>{getTokenCooldownRemaining()}</strong>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-foreground/80">التوكن الجديد</Label>
                <Input
                  placeholder="أدخل التوكن الجديد..."
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  dir="ltr"
                  disabled={!canChangeToken()}
                  className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground text-left font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleChangeToken}
                disabled={!canChangeToken() || !newToken.trim() || savingSettings}
                className="w-full gradient-telegram text-primary-foreground glow-primary hover:opacity-90"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Key className="w-4 h-4 ml-2" />}
                تغيير التوكن
              </Button>

              {botSettings?.token_updated_at && (
                <p className="text-xs text-muted-foreground text-center">
                  آخر تغيير: {new Date(botSettings.token_updated_at).toLocaleDateString("ar-SA")}
                </p>
              )}
            </div>

            {/* Admin Settings */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">إعدادات الأدمن</h3>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground/80">معرف الأدمن (Telegram ID)</Label>
                <Input
                  placeholder="مثال: 123456789"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  dir="ltr"
                  className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground text-left font-mono"
                />
                <p className="text-xs text-muted-foreground">فقط هذا المعرف يمكنه التحكم بالبوت. اتركه فارغاً للسماح للجميع.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground/80 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  رسالة غير المشتركين
                </Label>
                <Textarea
                  placeholder="الرسالة التي تظهر لغير المشتركين..."
                  value={nonSubMessage}
                  onChange={(e) => setNonSubMessage(e.target.value)}
                  rows={3}
                  className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground resize-none"
                />
              </div>

              <Button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full gradient-telegram text-primary-foreground glow-primary hover:opacity-90"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                حفظ الإعدادات
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
