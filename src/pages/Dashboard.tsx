import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, Trash2, RefreshCw, Users, Zap, Bot, UserPlus, Clock,
  Settings, Key, Shield, MessageSquare, Save, Loader2, User, Calendar, Hash,
  LayoutDashboard, ChevronLeft, ChevronRight, Search, AlertTriangle, Menu, X,
  BarChart3,
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

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

type TabKey = "overview" | "subscribers" | "expired" | "analytics" | "settings";

interface DashboardProps {
  onShowAdmin?: () => void;
}

const Dashboard = ({ onShowAdmin }: DashboardProps) => {
  const { t, lang, dir } = useLanguage();
  const [subscribers, setSubscribers] = useState<TelegramSubscriber[]>([]);
  const [botSettings, setBotSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newToken, setNewToken] = useState("");
  const [adminId, setAdminId] = useState("");
  const [nonSubMessage, setNonSubMessage] = useState("");

  useEffect(() => { fetchData(); }, []);

  const switchTab = (key: TabKey) => { setActiveTab(key); setSidebarOpen(false); };

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
    return `${days} ${t("dash.dayAndHour")} ${hours} ${t("dash.hour")}`;
  };

  const handleChangeToken = async () => {
    if (!newToken.trim() || !canChangeToken()) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase.from("bot_tokens").update({ token: newToken.trim(), token_updated_at: new Date().toISOString() }).eq("id", botSettings!.id);
      if (error) throw error;
      const { error: webhookErr } = await supabase.functions.invoke("telegram-bot", { body: { action: "setup_webhook", bot_token: newToken.trim() } });
      if (webhookErr) throw webhookErr;
      toast({ title: t("dash.tokenChanged") });
      setNewToken("");
      fetchData();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setSavingSettings(false); }
  };

  const handleSaveSettings = async () => {
    if (!botSettings) return;
    setSavingSettings(true);
    try {
      const updates: any = { non_subscriber_message: nonSubMessage.trim() };
      updates.admin_telegram_id = adminId.trim() ? parseInt(adminId.trim()) : null;
      const { error } = await supabase.from("bot_tokens").update(updates).eq("id", botSettings.id);
      if (error) throw error;
      toast({ title: t("dash.settingsSaved") });
      fetchData();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setSavingSettings(false); }
  };

  const deleteSubscriber = async (id: string) => {
    const { error } = await supabase.from("telegram_subscribers").delete().eq("id", id);
    if (!error) {
      setSubscribers((prev) => prev.filter((s) => s.id !== id));
      toast({ title: t("dash.subscriberDeleted") });
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const isExpired = (sub: TelegramSubscriber) => !sub.is_permanent && sub.expires_at && new Date(sub.expires_at) < new Date();
  const daysRemaining = (expiresAt: string) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
  const getDisplayName = (sub: TelegramSubscriber) => {
    const parts = [sub.first_name, sub.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  };

  const activeSubs = subscribers.filter((s) => !isExpired(s));
  const expiredSubs = subscribers.filter((s) => isExpired(s));
  const permanentCount = subscribers.filter((s) => s.is_permanent).length;
  const warningCount = activeSubs.filter((s) => !s.is_permanent && s.expires_at && daysRemaining(s.expires_at) <= 3).length;

  const navItems: { key: TabKey; icon: typeof Users; label: string; badge?: number }[] = [
    { key: "overview", icon: LayoutDashboard, label: t("dash.overview") },
    { key: "subscribers", icon: Users, label: t("dash.subscribers"), badge: activeSubs.length },
    { key: "expired", icon: Clock, label: t("dash.expired"), badge: expiredSubs.length },
    { key: "analytics", icon: BarChart3, label: t("dash.analytics") },
    { key: "settings", icon: Settings, label: t("dash.settings") },
  ];

  const filterSubs = (list: TelegramSubscriber[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((s) =>
      s.telegram_user_id.toString().includes(q) || s.telegram_username?.toLowerCase().includes(q) ||
      s.first_name?.toLowerCase().includes(q) || s.last_name?.toLowerCase().includes(q)
    );
  };

  // ─── Analytics Data ───
  const analyticsData = useMemo(() => {
    const now = new Date();
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split("T")[0];
    });

    const newSubsByDay = last30.map((date) => ({
      date: date.slice(5),
      [t("analytics.newSubs")]: subscribers.filter((s) => s.created_at.startsWith(date)).length,
      [t("analytics.expirations")]: subscribers.filter((s) => s.expires_at && s.expires_at.startsWith(date) && new Date(s.expires_at) < now).length,
    }));

    const statusData = [
      { name: t("dash.activeBadge"), value: activeSubs.filter(s => !s.is_permanent).length, color: "hsl(var(--success))" },
      { name: t("dash.permanentBadge"), value: permanentCount, color: "hsl(var(--primary))" },
      { name: t("dash.expiredBadge"), value: expiredSubs.length, color: "hsl(var(--destructive))" },
    ].filter(d => d.value > 0);

    const avgDuration = subscribers.filter(s => s.subscription_days).reduce((sum, s) => sum + (s.subscription_days || 0), 0) / (subscribers.filter(s => s.subscription_days).length || 1);
    const expiringSoon = activeSubs.filter((s) => !s.is_permanent && s.expires_at && daysRemaining(s.expires_at) <= 7).length;

    return { newSubsByDay, statusData, avgDuration: Math.round(avgDuration), expiringSoon };
  }, [subscribers, lang]);

  // ─── Mobile Card ───
  const SubCard = ({ sub }: { sub: TelegramSubscriber }) => {
    const expired = isExpired(sub);
    const displayName = getDisplayName(sub);
    const remaining = sub.expires_at ? daysRemaining(sub.expires_at) : null;
    return (
      <div className="glass-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {sub.photo_url ? (
              <img src={sub.photo_url} alt="" className="w-10 h-10 rounded-full object-cover border border-border/50"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
            ) : null}
            <div className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center ${sub.photo_url ? "hidden" : ""}`}>
              <User className="w-5 h-5 text-primary/60" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium text-foreground text-sm truncate">{displayName || `${t("dash.user")} ${sub.telegram_user_id}`}</p>
              {expired ? (
                <Badge variant="destructive" className="text-[10px] font-medium flex-shrink-0">{t("dash.expiredBadge")}</Badge>
              ) : sub.is_permanent ? (
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-medium hover:bg-primary/20 flex-shrink-0">{t("dash.permanentBadge")}</Badge>
              ) : remaining !== null && remaining <= 3 ? (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] font-medium hover:bg-yellow-500/20 flex-shrink-0">⚠ {remaining} {t("dash.day")}</Badge>
              ) : (
                <Badge className="bg-success/20 text-success border-success/30 text-[10px] font-medium hover:bg-success/20 flex-shrink-0">{t("dash.activeBadge")}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono" dir="ltr">{sub.telegram_user_id}</span>
              {sub.telegram_username && <span dir="ltr">@{sub.telegram_username}</span>}
              {sub.is_permanent ? (
                <span className="text-primary">{t("dash.permanent")}</span>
              ) : sub.expires_at ? (
                <span className={expired ? "text-destructive" : ""}>
                  {expired ? `${t("dash.expiredOn")} ${new Date(sub.expires_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}` : `${remaining} ${t("dash.daysLeft")}`}
                </span>
              ) : null}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => deleteSubscriber(sub.id)} className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  // ─── Desktop Table ───
  const SubTable = ({ list }: { list: TelegramSubscriber[] }) => {
    const filtered = filterSubs(list);
    return (
      <div className="glass-card overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">{t("dash.subscriber")}</TableHead>
              <TableHead className="text-muted-foreground font-medium">{t("dash.id")}</TableHead>
              <TableHead className="text-muted-foreground font-medium">{t("dash.status")}</TableHead>
              <TableHead className="text-muted-foreground font-medium">{t("dash.duration")}</TableHead>
              <TableHead className="text-muted-foreground font-medium">{t("dash.subDate")}</TableHead>
              <TableHead className="text-muted-foreground font-medium w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{t("dash.noSubs")}</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((sub) => {
                const expired = isExpired(sub);
                const displayName = getDisplayName(sub);
                const remaining = sub.expires_at ? daysRemaining(sub.expires_at) : null;
                return (
                  <TableRow key={sub.id} className="border-border/30 hover:bg-secondary/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {sub.photo_url ? (
                            <img src={sub.photo_url} alt="" className="w-9 h-9 rounded-full object-cover border border-border/50"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                          ) : null}
                          <div className={`w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center ${sub.photo_url ? "hidden" : ""}`}>
                            <User className="w-4 h-4 text-primary/60" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{displayName || `${t("dash.user")} ${sub.telegram_user_id}`}</p>
                          {sub.telegram_username && <p className="text-xs text-muted-foreground" dir="ltr">@{sub.telegram_username}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><span className="font-mono text-xs text-muted-foreground" dir="ltr">{sub.telegram_user_id}</span></TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge variant="destructive" className="text-[10px] font-medium">{t("dash.expiredBadge")}</Badge>
                      ) : sub.is_permanent ? (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-medium hover:bg-primary/20">{t("dash.permanentBadge")}</Badge>
                      ) : remaining !== null && remaining <= 3 ? (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] font-medium hover:bg-yellow-500/20">⚠ {remaining} {t("dash.day")}</Badge>
                      ) : (
                        <Badge className="bg-success/20 text-success border-success/30 text-[10px] font-medium hover:bg-success/20">{t("dash.activeBadge")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {sub.is_permanent ? "—" : sub.expires_at ? (expired ? `${t("dash.expiredOn")} ${new Date(sub.expires_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}` : `${remaining} ${t("dash.daysLeft")}`) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(sub.created_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteSubscriber(sub.id)} className="text-muted-foreground hover:text-destructive h-8 w-8">
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

  const SubCardList = ({ list }: { list: TelegramSubscriber[] }) => {
    const filtered = filterSubs(list);
    return (
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 glass-card">
            <UserPlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-muted-foreground">{t("dash.noSubs")}</p>
          </div>
        ) : filtered.map((sub) => <SubCard key={sub.id} sub={sub} />)}
      </div>
    );
  };

  const SubList = ({ list }: { list: TelegramSubscriber[] }) => (<><SubTable list={list} /><SubCardList list={list} /></>);

  return (
    <div className="min-h-screen flex w-full" dir={dir}>
      {sidebarOpen && <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed top-0 ${dir === "rtl" ? "right-0 border-l" : "left-0 border-r"} h-full z-50 bg-card border-border/50 transition-all duration-300 flex flex-col
        ${sidebarOpen ? "w-56 translate-x-0" : `md:w-16 w-0 ${dir === "rtl" ? "translate-x-full md:translate-x-0" : "-translate-x-full md:translate-x-0"}`}`}>
        <div className="h-16 flex items-center gap-3 px-4 border-b border-border/50 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg gradient-telegram flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          {sidebarOpen && <span className="font-bold text-foreground truncate">{t("dash.subMgmt")}</span>}
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(false)} className={`${dir === "rtl" ? "mr-auto" : "ml-auto"} md:hidden text-muted-foreground hover:text-foreground`}>
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(({ key, icon: Icon, label, badge }) => (
            <button key={key} onClick={() => switchTab(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                activeTab === key ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}>
              <Icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-start">{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full font-mono">{badge}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-border/50 space-y-1">
          {sidebarOpen && <LanguageSwitcher className="w-full justify-center" />}
          {onShowAdmin && (
            <button onClick={onShowAdmin} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors">
              <Shield className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{t("dash.adminPanel")}</span>}
            </button>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full hidden md:flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors">
            {sidebarOpen ? (dir === "rtl" ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />) : (dir === "rtl" ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />)}
            {sidebarOpen && <span>{t("dash.collapseMenu")}</span>}
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span>{t("common.logout")}</span>}
          </button>
        </div>
      </aside>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border/50 md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {navItems.map(({ key, icon: Icon, label, badge }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors relative ${activeTab === key ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="w-5 h-5" />
              <span className="text-[9px]">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="absolute -top-0.5 right-0.5 bg-primary text-primary-foreground text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-mono">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 pb-20 md:pb-0 ${sidebarOpen ? (dir === "rtl" ? "md:mr-56" : "md:ml-56") : (dir === "rtl" ? "md:mr-16" : "md:ml-16")} ${dir === "rtl" ? "mr-0" : "ml-0"}`}>
        <header className="h-14 md:h-16 border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-30 flex items-center px-4 md:px-6 gap-3">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-base md:text-lg font-bold text-foreground">
            {navItems.find((n) => n.key === activeTab)?.label}
          </h2>
          <div className="flex-1" />
          <div className="md:hidden"><LanguageSwitcher /></div>
          <Button variant="ghost" size="icon" onClick={fetchData} className="text-muted-foreground h-9 w-9">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </header>

        <div className="p-4 md:p-6 max-w-5xl">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {[
                  { icon: Users, label: t("dash.totalSubs"), value: subscribers.length, color: "text-primary" },
                  { icon: Zap, label: t("dash.active"), value: activeSubs.length, color: "text-success" },
                  { icon: Clock, label: t("dash.expiredLabel"), value: expiredSubs.length, color: "text-destructive" },
                  { icon: Shield, label: t("dash.permanent"), value: permanentCount, color: "text-primary" },
                ].map(({ icon: Icon, label, value, color }, i) => (
                  <div key={i} className="glass-card p-4 md:p-5">
                    <Icon className={`w-4 h-4 md:w-5 md:h-5 ${color} mb-2 md:mb-3`} />
                    <p className="text-2xl md:text-3xl font-bold text-foreground">{value}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>
              {warningCount > 0 && (
                <div className="glass-card p-3 md:p-4 border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium text-yellow-400">{warningCount} {t("dash.warning")}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 hidden sm:block">{t("dash.autoWarning")}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab("subscribers")} className="text-yellow-400 hover:text-yellow-300 text-xs flex-shrink-0">{t("dash.show")}</Button>
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">{t("dash.latestSubs")}</h3>
                <SubList list={subscribers.slice(0, 5)} />
              </div>
            </div>
          )}

          {/* SUBSCRIBERS */}
          {activeTab === "subscribers" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                  <Input placeholder={t("dash.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${dir === "rtl" ? "pr-10" : "pl-10"} bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground`} />
                </div>
                <p className="text-sm text-muted-foreground text-center sm:text-start">{activeSubs.length} {t("dash.activeCount")}</p>
              </div>
              {loading ? <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> : <SubList list={activeSubs} />}
            </div>
          )}

          {/* EXPIRED */}
          {activeTab === "expired" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                  <Input placeholder={t("dash.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${dir === "rtl" ? "pr-10" : "pl-10"} bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground`} />
                </div>
                <p className="text-sm text-muted-foreground text-center sm:text-start">{expiredSubs.length} {t("dash.expiredCount")}</p>
              </div>
              {loading ? <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> : <SubList list={expiredSubs} />}
            </div>
          )}

          {/* ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {[
                  { icon: Users, label: t("analytics.activeSubs"), value: activeSubs.length, color: "text-success" },
                  { icon: BarChart3, label: t("analytics.avgDuration"), value: `${analyticsData.avgDuration} ${t("dash.day")}`, color: "text-primary" },
                  { icon: AlertTriangle, label: t("analytics.expiringSoon"), value: analyticsData.expiringSoon, color: "text-yellow-400" },
                  { icon: Clock, label: t("dash.expiredLabel"), value: expiredSubs.length, color: "text-destructive" },
                ].map(({ icon: Icon, label, value, color }, i) => (
                  <div key={i} className="glass-card p-4 md:p-5">
                    <Icon className={`w-4 h-4 md:w-5 md:h-5 ${color} mb-2 md:mb-3`} />
                    <p className="text-2xl md:text-3xl font-bold text-foreground">{value}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Subscriptions chart */}
              <div className="glass-card p-4 md:p-6">
                <h3 className="text-sm font-semibold text-foreground mb-1">{t("analytics.last30Days")}</h3>
                <p className="text-xs text-muted-foreground mb-4">{t("analytics.newSubs")} & {t("analytics.expirations")}</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.newSubsByDay} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }} />
                      <Bar dataKey={t("analytics.newSubs")} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={t("analytics.expirations")} fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-card p-4 md:p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">{t("analytics.subsByStatus")}</h3>
                  <div className="h-52 flex items-center justify-center">
                    {analyticsData.statusData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={analyticsData.statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}>
                            {analyticsData.statusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-muted-foreground text-sm">{t("dash.noSubs")}</p>
                    )}
                  </div>
                </div>

                {/* Expiring soon list */}
                <div className="glass-card p-4 md:p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">{t("analytics.expiringSoon")} (7 {t("dash.day")})</h3>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {activeSubs.filter(s => !s.is_permanent && s.expires_at && daysRemaining(s.expires_at) <= 7).length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-4">—</p>
                    ) : (
                      activeSubs.filter(s => !s.is_permanent && s.expires_at && daysRemaining(s.expires_at) <= 7)
                        .sort((a, b) => daysRemaining(a.expires_at!) - daysRemaining(b.expires_at!))
                        .map(sub => (
                          <div key={sub.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30">
                            <span className="text-sm text-foreground truncate">{getDisplayName(sub) || `${t("dash.user")} ${sub.telegram_user_id}`}</span>
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                              {daysRemaining(sub.expires_at!)} {t("dash.day")}
                            </Badge>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-4 md:space-y-6 max-w-xl animate-fade-in">
              <div className="glass-card p-4 md:p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Key className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{t("dash.changeToken")}</h3>
                </div>
                {!canChangeToken() && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                    ⏳ {t("dash.cantChangeToken")} <strong>{getTokenCooldownRemaining()}</strong>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-foreground/80">{t("dash.newToken")}</Label>
                  <Input placeholder={t("dash.enterNewToken")} value={newToken} onChange={(e) => setNewToken(e.target.value)} dir="ltr" disabled={!canChangeToken()}
                    className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground text-left font-mono text-sm" />
                </div>
                <Button onClick={handleChangeToken} disabled={!canChangeToken() || !newToken.trim() || savingSettings}
                  className="w-full gradient-telegram text-primary-foreground hover:opacity-90">
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Key className="w-4 h-4 ml-2" />}
                  {t("dash.changeTokenBtn")}
                </Button>
                {botSettings?.token_updated_at && (
                  <p className="text-xs text-muted-foreground text-center">
                    {t("dash.lastChange")} {new Date(botSettings.token_updated_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}
                  </p>
                )}
              </div>
              <div className="glass-card p-4 md:p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{t("dash.adminSettings")}</h3>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground/80">{t("dash.adminId")}</Label>
                  <Input placeholder="123456789" value={adminId} onChange={(e) => setAdminId(e.target.value)} dir="ltr"
                    className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground text-left font-mono" />
                  <p className="text-xs text-muted-foreground">{t("dash.adminIdHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />{t("dash.nonSubMsg")}
                  </Label>
                  <Textarea placeholder={t("dash.nonSubMsgPlaceholder")} value={nonSubMessage} onChange={(e) => setNonSubMessage(e.target.value)} rows={3}
                    className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground resize-none" />
                </div>
                <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full gradient-telegram text-primary-foreground hover:opacity-90">
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                  {t("dash.saveSettings")}
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
