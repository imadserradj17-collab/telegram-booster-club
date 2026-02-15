import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, Trash2, RefreshCw, Users, Zap, Bot, UserPlus, Clock,
  Settings, Key, Shield, MessageSquare, Save, Loader2, User, Calendar, Hash,
  LayoutDashboard, ChevronLeft, ChevronRight, Search, AlertTriangle,
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

type TabKey = "overview" | "subscribers" | "expired" | "settings";

const Dashboard = () => {
  const [subscribers, setSubscribers] = useState<TelegramSubscriber[]>([]);
  const [botSettings, setBotSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  const activeSubs = subscribers.filter((s) => !isExpired(s));
  const expiredSubs = subscribers.filter((s) => isExpired(s));
  const permanentCount = subscribers.filter((s) => s.is_permanent).length;
  const warningCount = activeSubs.filter(
    (s) => !s.is_permanent && s.expires_at && daysRemaining(s.expires_at) <= 3
  ).length;

  const navItems: { key: TabKey; icon: typeof Users; label: string; badge?: number }[] = [
    { key: "overview", icon: LayoutDashboard, label: "نظرة عامة" },
    { key: "subscribers", icon: Users, label: "المشتركون", badge: activeSubs.length },
    { key: "expired", icon: Clock, label: "المنتهيون", badge: expiredSubs.length },
    { key: "settings", icon: Settings, label: "الإعدادات" },
  ];

  const filterSubs = (list: TelegramSubscriber[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (s) =>
        s.telegram_user_id.toString().includes(q) ||
        s.telegram_username?.toLowerCase().includes(q) ||
        s.first_name?.toLowerCase().includes(q) ||
        s.last_name?.toLowerCase().includes(q)
    );
  };

  const SubTable = ({ list }: { list: TelegramSubscriber[] }) => {
    const filtered = filterSubs(list);
    return (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-right text-muted-foreground font-medium">المشترك</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">المعرف</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">الحالة</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">المدة</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">تاريخ الاشتراك</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>لا يوجد مشتركون</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((sub) => {
                const expired = isExpired(sub);
                const displayName = getDisplayName(sub);
                const remaining = sub.expires_at ? daysRemaining(sub.expires_at) : null;

                return (
                  <TableRow key={sub.id} className="border-border/30 hover:bg-secondary/30">
                    {/* Avatar + Name */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {sub.photo_url ? (
                            <img
                              src={sub.photo_url}
                              alt=""
                              className="w-9 h-9 rounded-full object-cover border border-border/50"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                              }}
                            />
                          ) : null}
                          <div className={`w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center ${sub.photo_url ? "hidden" : ""}`}>
                            <User className="w-4 h-4 text-primary/60" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">
                            {displayName || `مستخدم ${sub.telegram_user_id}`}
                          </p>
                          {sub.telegram_username && (
                            <p className="text-xs text-muted-foreground" dir="ltr">@{sub.telegram_username}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* ID */}
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground" dir="ltr">{sub.telegram_user_id}</span>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      {expired ? (
                        <Badge variant="destructive" className="text-[10px] font-medium">منتهي</Badge>
                      ) : sub.is_permanent ? (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-medium hover:bg-primary/20">♾ دائم</Badge>
                      ) : remaining !== null && remaining <= 3 ? (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] font-medium hover:bg-yellow-500/20">
                          ⚠ {remaining} يوم
                        </Badge>
                      ) : (
                        <Badge className="bg-success/20 text-success border-success/30 text-[10px] font-medium hover:bg-success/20">نشط</Badge>
                      )}
                    </TableCell>

                    {/* Duration */}
                    <TableCell className="text-sm text-muted-foreground">
                      {sub.is_permanent ? "—" : sub.expires_at ? (
                        expired
                          ? `انتهى ${new Date(sub.expires_at).toLocaleDateString("ar-SA")}`
                          : `${remaining} يوم متبقي`
                      ) : "—"}
                    </TableCell>

                    {/* Created */}
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(sub.created_at).toLocaleDateString("ar-SA")}
                    </TableCell>

                    {/* Delete */}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSubscriber(sub.id)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 right-0 h-full z-40 bg-card border-l border-border/50 transition-all duration-300 flex flex-col ${
          sidebarOpen ? "w-56" : "w-16"
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-border/50 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg gradient-telegram flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          {sidebarOpen && <span className="font-bold text-foreground truncate">إدارة الاشتراكات</span>}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map(({ key, icon: Icon, label, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                activeTab === key
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-right">{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-border/50 space-y-1">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          >
            {sidebarOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {sidebarOpen && <span>طي القائمة</span>}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${sidebarOpen ? "mr-56" : "mr-16"}`}
      >
        {/* Top Bar */}
        <header className="h-16 border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-30 flex items-center px-6 gap-4">
          <h2 className="text-lg font-bold text-foreground">
            {navItems.find((n) => n.key === activeTab)?.label}
          </h2>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={fetchData} className="text-muted-foreground">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </header>

        <div className="p-6 max-w-5xl">
          {/* ─── OVERVIEW ─── */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-fade-in">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: Users, label: "إجمالي المشتركين", value: subscribers.length, color: "text-primary" },
                  { icon: Zap, label: "نشط", value: activeSubs.length, color: "text-success" },
                  { icon: Clock, label: "منتهي", value: expiredSubs.length, color: "text-destructive" },
                  { icon: Shield, label: "دائم", value: permanentCount, color: "text-primary" },
                ].map(({ icon: Icon, label, value, color }, i) => (
                  <div key={i} className="glass-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <p className="text-3xl font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {warningCount > 0 && (
                <div className="glass-card p-4 border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-400">
                        {warningCount} مشترك سينتهي اشتراكهم خلال 3 أيام
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        يُرسل تحذير تلقائي قبل 24 ساعة من الانتهاء
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab("subscribers")}
                      className="mr-auto text-yellow-400 hover:text-yellow-300 text-xs"
                    >
                      عرض
                    </Button>
                  </div>
                </div>
              )}

              {/* Recent Subscribers */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">آخر المشتركين</h3>
                <SubTable list={subscribers.slice(0, 5)} />
              </div>
            </div>
          )}

          {/* ─── SUBSCRIBERS ─── */}
          {activeTab === "subscribers" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالاسم أو المعرف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10 bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {activeSubs.length} مشترك نشط
                </p>
              </div>
              {loading ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </div>
              ) : (
                <SubTable list={activeSubs} />
              )}
            </div>
          )}

          {/* ─── EXPIRED ─── */}
          {activeTab === "expired" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالاسم أو المعرف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10 bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {expiredSubs.length} مشترك منتهي
                </p>
              </div>
              {loading ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </div>
              ) : (
                <SubTable list={expiredSubs} />
              )}
            </div>
          )}

          {/* ─── SETTINGS ─── */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-xl animate-fade-in">
              {/* Change Token */}
              <div className="glass-card p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
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
                  className="w-full gradient-telegram text-primary-foreground hover:opacity-90"
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
              <div className="glass-card p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
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
                  className="w-full gradient-telegram text-primary-foreground hover:opacity-90"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                  حفظ الإعدادات
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
