import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LogOut, Trash2, RefreshCw, Users, Zap, Bot, UserPlus, Clock,
  Settings, Key, Shield, MessageSquare, Save, Loader2, User, Calendar, Hash,
  LayoutDashboard, ChevronLeft, ChevronRight, Search, AlertTriangle, Menu, X,
  BarChart3, Tv, Plus, Send, Link, Edit, CheckCircle, XCircle, FileText, MessageCircle,
} from "lucide-react";
import ChannelMessagesView from "@/components/ChannelMessagesView";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { Switch } from "@/components/ui/switch";

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

interface TelegramChannel {
  id: string;
  channel_id: number;
  channel_name: string;
  channel_type: string;
  invite_link: string | null;
  created_at: string;
}

interface BotSettings {
  id: string;
  token: string;
  token_updated_at: string;
  admin_telegram_id: number | null;
  non_subscriber_message: string;
  public_channel_id: string | null;
  subscribers_channel_id: string | null;
  free_trial_enabled: boolean;
  free_trial_days: number;
  mandatory_channel_id: string | null;
  auto_scan_enabled: boolean;
  auto_scan_interval: number;
}

interface FreeTrialUser {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  activated_at: string;
  expires_at: string;
}

type TabKey = "overview" | "subscribers" | "expired" | "channels" | "messages" | "broadcast" | "analytics" | "settings" | "free_trial" | "kick_nonsubs" | "scan_logs";

interface DashboardProps {
  onShowAdmin?: () => void;
}

const Dashboard = ({ onShowAdmin }: DashboardProps) => {
  const { t, lang, dir } = useLanguage();
  const [subscribers, setSubscribers] = useState<TelegramSubscriber[]>([]);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [subscriberChannels, setSubscriberChannels] = useState<Record<string, { id: string; channel_name: string }[]>>({});
  const [botSettings, setBotSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newToken, setNewToken] = useState("");
  const [adminId, setAdminId] = useState("");
  const [nonSubMessage, setNonSubMessage] = useState("");
  const [publicChannelId, setPublicChannelId] = useState<string | null>(null);
  const [subscribersChannelId, setSubscribersChannelId] = useState<string | null>(null);
  const [mandatoryChannelId, setMandatoryChannelId] = useState<string | null>(null);

  // Add subscriber dialog
  const [showAddSub, setShowAddSub] = useState(false);
  const [addSubForm, setAddSubForm] = useState({
    telegram_user_id: "", telegram_username: "", first_name: "", last_name: "",
    duration: "30", customDays: "", is_permanent: false, channel_ids: [] as string[],
  });
  const [addingSubscriber, setAddingSubscriber] = useState(false);

  // Edit channels dialog
  const [editChannelsSub, setEditChannelsSub] = useState<TelegramSubscriber | null>(null);
  const [editChannelIds, setEditChannelIds] = useState<string[]>([]);
  const [savingChannels, setSavingChannels] = useState(false);

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [broadcastTarget, setBroadcastTarget] = useState<"subscribers" | "all_users" | "channels">("subscribers");
  const [botUsersCount, setBotUsersCount] = useState(0);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [channelSearch, setChannelSearch] = useState("");
  const [publicMembersCount, setPublicMembersCount] = useState(0);
  const [kickingPublic, setKickingPublic] = useState(false);
  const [kickingExpired, setKickingExpired] = useState(false);
  const [unbanningAll, setUnbanningAll] = useState(false);
  const [checkingBlocked, setCheckingBlocked] = useState(false);
  const [kickingNonSubs, setKickingNonSubs] = useState(false);
  const [kickNonSubsChannelId, setKickNonSubsChannelId] = useState<string>("all");
  const [kickAllChannelId, setKickAllChannelId] = useState<string>("all");
  const [kickNonSubsResult, setKickNonSubsResult] = useState<{
    kicked: number; failed: number; checked: number;
    channels_results: { channel_name: string; channel_id: number; checked: number; kicked: number; failed: number; kicked_users: { telegram_user_id: number; name: string }[] }[];
    kicked_users: { telegram_user_id: number; name: string }[];
  } | null>(null);
  const [kickNonSubsActiveChannel, setKickNonSubsActiveChannel] = useState<number>(-1);
  const [kickingAllMembers, setKickingAllMembers] = useState(false);
  const [kickAllResult, setKickAllResult] = useState<{
    kicked: number; failed: number;
    channels_results: { channel_name: string; channel_id: number; checked: number; kicked: number; failed: number; kicked_users: { telegram_user_id: number; name: string }[] }[];
    kicked_users: { telegram_user_id: number; name: string }[];
  } | null>(null);
  const [kickAllActiveChannel, setKickAllActiveChannel] = useState<number>(-1);
  const [freeTrialEnabled, setFreeTrialEnabled] = useState(false);
  const [freeTrialDays, setFreeTrialDays] = useState(3);
  const [freeTrialUsers, setFreeTrialUsers] = useState<FreeTrialUser[]>([]);
  const [freeTrialChannelIds, setFreeTrialChannelIds] = useState<string[]>([]);
  const [checkingBotAdmin, setCheckingBotAdmin] = useState(false);
  const [botAdminCheckIdx, setBotAdminCheckIdx] = useState(-1);
  const [botAdminResults, setBotAdminResults] = useState<{ channel_name: string; channel_id: number; channel_type: string; is_admin: boolean; bot_permissions: string[] }[] | null>(null);
  const [scanLogs, setScanLogs] = useState<any[]>([]);
  const [scanLogsLoading, setScanLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanInterval, setAutoScanInterval] = useState(60);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (activeTab === "scan_logs") fetchScanLogs(); }, [activeTab]);

  const fetchScanLogs = async () => {
    setScanLogsLoading(true);
    const { data } = await supabase.from("scan_logs").select("*").order("created_at", { ascending: false }).limit(50);
    setScanLogs(data || []);
    setScanLogsLoading(false);
  };

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
      setPublicChannelId((settingsRes.data as any).public_channel_id || null);
      setSubscribersChannelId((settingsRes.data as any).subscribers_channel_id || null);
      setFreeTrialEnabled((settingsRes.data as any).free_trial_enabled ?? false);
      setFreeTrialDays((settingsRes.data as any).free_trial_days ?? 3);
      setMandatoryChannelId((settingsRes.data as any).mandatory_channel_id || null);
      setFreeTrialChannelIds((settingsRes.data as any).free_trial_channel_ids || []);
      setAutoScanEnabled((settingsRes.data as any).auto_scan_enabled ?? false);
      setAutoScanInterval((settingsRes.data as any).auto_scan_interval ?? 60);
    }

    // Fetch channels
    const channelsRes = await supabase.from("telegram_channels").select("*").order("created_at", { ascending: false });
    if (channelsRes.data) setChannels(channelsRes.data);

    // Fetch subscriber-channel mappings + bot users count + public members count
    try {
      const [scRes, buRes, pmRes, trialRes] = await Promise.all([
        supabase.functions.invoke("manage-bot", { body: { action: "get_subscriber_channels" } }),
        supabase.functions.invoke("manage-bot", { body: { action: "get_bot_users" } }),
        supabase.from("public_channel_members").select("id", { count: "exact", head: true }),
        supabase.from("free_trial_users").select("*").order("activated_at", { ascending: false }),
      ]);
      if (scRes.data?.subscriber_channels) setSubscriberChannels(scRes.data.subscriber_channels);
      if (buRes.data?.count !== undefined) setBotUsersCount(buRes.data.count);
      setPublicMembersCount(pmRes.count ?? 0);
      if (trialRes.data) setFreeTrialUsers(trialRes.data);
    } catch {}

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
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${days} ${t("dash.dayAndHour")} ${hours} ${t("dash.hour")} ${t("dash.andMinute")} ${minutes} ${t("dash.minute")}`;
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
      const updates: any = { non_subscriber_message: nonSubMessage.trim(), public_channel_id: publicChannelId || null, subscribers_channel_id: subscribersChannelId || null, free_trial_enabled: freeTrialEnabled, free_trial_days: freeTrialDays, mandatory_channel_id: mandatoryChannelId || null, free_trial_channel_ids: freeTrialChannelIds, auto_scan_enabled: autoScanEnabled, auto_scan_interval: autoScanInterval };
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
    if (!confirm(t("subs.deleteConfirm"))) return;
    // Kick from all channels first, then delete
    try {
      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: { action: "kick_from_channels", subscriber_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if ((data?.kicked ?? 0) === 0 && (data?.failed ?? 0) > 0) {
        throw new Error(t("subs.kickBeforeDeleteFailed"));
      }
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("telegram_subscribers").delete().eq("id", id);
    if (!error) {
      setSubscribers((prev) => prev.filter((s) => s.id !== id));
      toast({ title: t("dash.subscriberDeleted") });
    }
  };

  const handleKickFromChannels = async (sub: TelegramSubscriber) => {
    if (!confirm(t("subs.kickConfirm"))) return;
    setKickingId(sub.id);
    try {
      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: { action: "kick_from_channels", subscriber_id: sub.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: `${t("subs.kicked")} - ${data.kicked} ✅${data.failed > 0 ? ` / ${data.failed} ❌` : ""}` });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setKickingId(null); }
  };

  const deleteChannel = async (id: string) => {
    try {
      const { data } = await supabase.functions.invoke("manage-bot", {
        body: { action: "delete_channel", channel_id: id },
      });
      if (data?.ok) {
        setChannels((prev) => prev.filter((c) => c.id !== id));
        toast({ title: t("channels.deleted") });
      }
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
  };

  const handleAddSubscriber = async () => {
    if (!addSubForm.telegram_user_id.trim()) return;
    setAddingSubscriber(true);
    try {
      const days = addSubForm.is_permanent ? null :
        addSubForm.duration === "custom" ? parseInt(addSubForm.customDays) : parseInt(addSubForm.duration);

      if (!addSubForm.is_permanent && (!days || days <= 0)) {
        toast({ title: t("common.error"), description: t("admin.invalidDays"), variant: "destructive" });
        setAddingSubscriber(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: {
          action: "add_subscriber",
          telegram_user_id: parseInt(addSubForm.telegram_user_id),
          telegram_username: addSubForm.telegram_username || null,
          first_name: addSubForm.first_name || null,
          last_name: addSubForm.last_name || null,
          days,
          is_permanent: addSubForm.is_permanent,
          channel_ids: addSubForm.channel_ids,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t("subs.added"),
        description: data?.notified === false ? "⚠️ لم يتم إرسال الروابط (المشترك لم يبدأ البوت)" : undefined,
      });
      setShowAddSub(false);
      setAddSubForm({ telegram_user_id: "", telegram_username: "", first_name: "", last_name: "", duration: "30", customDays: "", is_permanent: false, channel_ids: [] });
      fetchData();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setAddingSubscriber(false); }
  };

  const handleEditChannels = (sub: TelegramSubscriber) => {
    const currentChannels = subscriberChannels[sub.id] || [];
    setEditChannelIds(currentChannels.map(c => c.id));
    setChannelSearch("");
    setEditChannelsSub(sub);
  };

  const handleSaveSubChannels = async () => {
    if (!editChannelsSub) return;
    setSavingChannels(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: { action: "update_subscriber_channels", subscriber_id: editChannelsSub.id, channel_ids: editChannelIds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: t("subs.channelsSaved") });
      setEditChannelsSub(null);
      fetchData();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setSavingChannels(false); }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const action = broadcastTarget === "all_users" ? "broadcast_all" : broadcastTarget === "channels" ? "broadcast_channels" : "broadcast";
      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: { action, message: broadcastMsg },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBroadcastResult({ sent: data.sent, failed: data.failed, total: data.total });
      toast({ title: t("broadcast.sent") });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setBroadcasting(false); }
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
    { key: "channels", icon: Tv, label: t("channels.title"), badge: channels.length },
    { key: "messages", icon: MessageCircle, label: lang === "ar" ? "الرسائل" : "Messages" },
    { key: "free_trial", icon: Zap, label: t("dash.freeTrial"), badge: freeTrialUsers.length },
    { key: "broadcast", icon: Send, label: t("broadcast.title") },
    { key: "kick_nonsubs", icon: Shield, label: t("dash.kickNonSubscribers") },
    { key: "scan_logs", icon: FileText, label: t("scanLogs.title") },
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

  // Analytics Data
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

  // ─── Subscriber Channel Badges ───
  const SubChannelBadges = ({ subId }: { subId: string }) => {
    const chans = subscriberChannels[subId];
    if (!chans || chans.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    if (chans.length === channels.length && channels.length > 0) {
      return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] hover:bg-primary/20">{t("subs.allAssigned")}</Badge>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {chans.map(ch => (
          <Badge key={ch.id} variant="outline" className="text-[10px] border-border/50">{ch.channel_name}</Badge>
        ))}
      </div>
    );
  };

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
            <div className="mt-2">
              <SubChannelBadges subId={sub.id} />
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => handleEditChannels(sub)} className="text-muted-foreground hover:text-primary h-8 w-8">
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleKickFromChannels(sub)} disabled={kickingId === sub.id} className="text-muted-foreground hover:text-yellow-500 h-8 w-8" title={t("subs.kickAll")}>
              {kickingId === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => deleteSubscriber(sub.id)} className="text-muted-foreground hover:text-destructive h-8 w-8">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
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
              <TableHead className="text-muted-foreground font-medium">{t("subs.assignedChannels")}</TableHead>
              <TableHead className="text-muted-foreground font-medium">{t("dash.subDate")}</TableHead>
              <TableHead className="text-muted-foreground font-medium w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
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
                    <TableCell><SubChannelBadges subId={sub.id} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(sub.created_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEditChannels(sub)} className="text-muted-foreground hover:text-primary h-8 w-8">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleKickFromChannels(sub)} disabled={kickingId === sub.id} className="text-muted-foreground hover:text-yellow-500 h-8 w-8" title={t("subs.kickAll")}>
                          {kickingId === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteSubscriber(sub.id)} className="text-muted-foreground hover:text-destructive h-8 w-8">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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

  const toggleAddSubChannel = (id: string) => {
    setAddSubForm(prev => ({
      ...prev,
      channel_ids: prev.channel_ids.includes(id) ? prev.channel_ids.filter(c => c !== id) : [...prev.channel_ids, id],
    }));
  };

  const toggleEditChannel = (id: string) => {
    setEditChannelIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

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
        <div className="flex items-center justify-around h-14 overflow-x-auto scrollbar-hide px-1">
          {navItems.map(({ key, icon: Icon, label, badge }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-colors relative flex-shrink-0 min-w-[3rem] ${activeTab === key ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="w-5 h-5" />
              <span className="text-[8px] leading-tight whitespace-nowrap">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="absolute -top-0.5 right-0 bg-primary text-primary-foreground text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-mono">
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
                  { icon: Tv, label: t("channels.title"), value: channels.length, color: "text-primary" },
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
              {/* Public Channel Members - Kick All */}
              {publicChannelId && publicChannelId !== "none" && (
                <div className="glass-card p-4 md:p-5 border-destructive/20">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-5 h-5 text-destructive" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{t("dash.publicMembers")}</h3>
                        <p className="text-xs text-muted-foreground">{t("dash.publicChannelHint")}</p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{publicMembersCount}</div>
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full mt-3"
                    disabled={kickingPublic || publicMembersCount === 0}
                    onClick={async () => {
                      if (!confirm(t("dash.kickAllPublicConfirm"))) return;
                      setKickingPublic(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("manage-bot", {
                          body: { action: "kick_public_members" },
                        });
                        if (error) throw error;
                        if (data?.error) throw new Error(data.error);
                        toast({ title: `${t("dash.kickAllPublicDone")} - ${data.kicked} ✅${data.failed > 0 ? ` / ${data.failed} ❌` : ""}` });
                        setPublicMembersCount(0);
                      } catch (error: any) {
                        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                      } finally { setKickingPublic(false); }
                    }}
                  >
                    {kickingPublic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t("dash.kickAllPublic")}
                  </Button>
                </div>
              )}
              {/* Kick Expired from All Channels */}
              {expiredSubs.length > 0 && (
                <div className="glass-card p-4 md:p-5 border-yellow-500/20">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{t("dash.kickExpiredFromChannels")}</h3>
                        <p className="text-xs text-muted-foreground">{expiredSubs.length} {t("dash.expiredLabel")}</p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-3 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
                    disabled={kickingExpired}
                    onClick={async () => {
                      if (!confirm(t("dash.kickExpiredConfirm"))) return;
                      setKickingExpired(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("manage-bot", {
                          body: { action: "kick_expired_from_channels" },
                        });
                        if (error) throw error;
                        if (data?.error) throw new Error(data.error);
                        toast({ title: `${t("dash.kickExpiredDone")} - ${data.kicked} ✅${data.failed > 0 ? ` / ${data.failed} ❌` : ""}` });
                      } catch (error: any) {
                        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                      } finally { setKickingExpired(false); }
                    }}
                  >
                    {kickingExpired ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    {t("dash.kickExpiredFromChannels")}
                  </Button>
                </div>
              )}
              {/* Unban All from All Channels */}
              <div className="glass-card p-4 md:p-5 border-green-500/20">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <UserPlus className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{t("dash.unbanAll")}</h3>
                      <p className="text-xs text-muted-foreground">{t("dash.unbanAllConfirm").split("؟")[0]}</p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-3 border-green-500/30 text-green-500 hover:bg-green-500/10 hover:text-green-400"
                  disabled={unbanningAll}
                  onClick={async () => {
                    if (!confirm(t("dash.unbanAllConfirm"))) return;
                    setUnbanningAll(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("manage-bot", {
                        body: { action: "unban_all_from_channels" },
                      });
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      toast({ title: `${t("dash.unbanAllDone")} - ${data.unbanned} ✅${data.failed > 0 ? ` / ${data.failed} ❌` : ""}` });
                    } catch (error: any) {
                      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                    } finally { setUnbanningAll(false); }
                  }}
                >
                  {unbanningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {t("dash.unbanAll")}
                </Button>
              </div>
              {/* Check Blocked Subscribers */}
              <div className="glass-card p-4 md:p-5 border-orange-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("dash.checkBlocked")}</h3>
                    <p className="text-xs text-muted-foreground">{t("dash.checkBlockedConfirm").split("؟")[0]}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-3 border-orange-500/30 text-orange-500 hover:bg-orange-500/10 hover:text-orange-400"
                  disabled={checkingBlocked}
                  onClick={async () => {
                    if (!confirm(t("dash.checkBlockedConfirm"))) return;
                    setCheckingBlocked(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("manage-bot", {
                        body: { action: "check_blocked_subscribers" },
                      });
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      if (data.blocked === 0) {
                        toast({ title: t("dash.checkBlockedNone") });
                      } else {
                        const names = data.blocked_users?.map((u: any) => u.name).join(", ") || "";
                        toast({ title: `${t("dash.checkBlockedDone")}: ${data.blocked} 🚫 | ✅ ${data.kicked}`, description: names });
                      }
                    } catch (error: any) {
                      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                    } finally { setCheckingBlocked(false); }
                  }}
                >
                  {checkingBlocked ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                  {t("dash.checkBlocked")}
                </Button>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">{t("dash.latestSubs")}</h3>
                <SubList list={subscribers.slice(0, 5)} />
              </div>
            </div>
          )}

          {/* SUBSCRIBERS */}
          {/* KICK NON-SUBSCRIBERS */}
          {activeTab === "kick_nonsubs" && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              {/* CHECK BOT ADMIN STATUS */}
              <div className="glass-card p-5 md:p-6 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-foreground">{t("dash.checkBotAdmin")}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("dash.checkBotAdminHint")}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-primary/30 text-primary hover:bg-primary/10"
                  disabled={checkingBotAdmin}
                  onClick={async () => {
                    setCheckingBotAdmin(true);
                    setBotAdminResults(null);
                    setBotAdminCheckIdx(0);
                    const progressInterval = setInterval(() => {
                      setBotAdminCheckIdx(prev => prev < channels.length - 1 ? prev + 1 : prev);
                    }, 1500);
                    try {
                      const { data, error } = await supabase.functions.invoke("manage-bot", {
                        body: { action: "check_bot_admin" },
                      });
                      clearInterval(progressInterval);
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      setBotAdminResults(data.channels);
                      setBotAdminCheckIdx(-1);
                    } catch (error: any) {
                      clearInterval(progressInterval);
                      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                      setBotAdminCheckIdx(-1);
                    } finally { setCheckingBotAdmin(false); }
                  }}
                >
                  {checkingBotAdmin ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{t("dash.checkBotAdminChecking")}</>
                  ) : (
                    <><Shield className="w-4 h-4" />{t("dash.checkBotAdminBtn")}</>
                  )}
                </Button>
              </div>

              {/* Bot Admin Check - Live scanning animation */}
              {checkingBotAdmin && !botAdminResults && (
                <div className="glass-card p-5 animate-fade-in">
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">
                      {lang === "ar" ? "جاري فحص صلاحيات البوت في القنوات..." : "Checking bot permissions in channels..."}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {channels.map((ch, idx) => (
                      <div key={ch.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-500 ${
                        idx === botAdminCheckIdx
                          ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10"
                          : idx < botAdminCheckIdx
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-border/30 bg-secondary/20 opacity-40"
                      }`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                          idx === botAdminCheckIdx ? "bg-primary/15" : idx < botAdminCheckIdx ? "bg-green-500/10" : "bg-secondary/30"
                        }`}>
                          {idx === botAdminCheckIdx ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : idx < botAdminCheckIdx ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Tv className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className={`text-sm truncate flex-1 ${idx === botAdminCheckIdx ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </span>
                        {idx === botAdminCheckIdx && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] animate-pulse flex-shrink-0">
                            {lang === "ar" ? "⟵ جاري الفحص" : "Checking ⟶"}
                          </Badge>
                        )}
                        {idx < botAdminCheckIdx && (
                          <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px] flex-shrink-0">✓</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bot Admin Check - Results */}
              {botAdminResults && (
                <div className="space-y-3 animate-fade-in">
                  {(() => {
                    const notAdmin = botAdminResults.filter(ch => !ch.is_admin);
                    const isAdmin = botAdminResults.filter(ch => ch.is_admin);
                    return (
                      <>
                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="glass-card text-center p-4 border-green-500/20">
                            <div className="text-2xl font-bold text-green-500">{isAdmin.length}</div>
                            <div className="text-xs text-green-500 mt-1">{t("dash.botIsAdmin")}</div>
                          </div>
                          <div className="glass-card text-center p-4 border-destructive/20">
                            <div className="text-2xl font-bold text-destructive">{notAdmin.length}</div>
                            <div className="text-xs text-destructive mt-1">{t("dash.botNotAdmin")}</div>
                          </div>
                        </div>

                        {notAdmin.length === 0 ? (
                          <div className="glass-card p-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                              <Shield className="w-6 h-6 text-green-500" />
                            </div>
                            <p className="text-sm text-green-500 font-medium">{t("dash.botAdminAllGood")}</p>
                          </div>
                        ) : (
                          <div className="glass-card overflow-hidden border-destructive/30">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-destructive/5">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center">
                                  <XCircle className="w-4 h-4 text-destructive" />
                                </div>
                                <h4 className="text-sm font-bold text-foreground">{t("dash.botNotAdminCount")}</h4>
                              </div>
                              <Badge variant="destructive" className="text-xs">
                                {notAdmin.length} {lang === "ar" ? "قناة" : "channels"}
                              </Badge>
                            </div>
                            <div className="divide-y divide-border/20">
                              {notAdmin.map((ch, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-destructive/5 transition-colors animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                    <XCircle className="w-5 h-5 text-destructive" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">ID: {ch.channel_id}</p>
                                  </div>
                                  <Badge variant="destructive" className="text-[10px] flex-shrink-0">
                                    {t("dash.botNotAdmin")}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Admin channels */}
                        {isAdmin.length > 0 && (
                          <div className="glass-card overflow-hidden border-green-500/20">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-green-500/5">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                </div>
                                <h4 className="text-sm font-bold text-foreground">{t("dash.botIsAdmin")}</h4>
                              </div>
                              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-xs">
                                {isAdmin.length} {lang === "ar" ? "قناة" : "channels"}
                              </Badge>
                            </div>
                            <div className="divide-y divide-border/20 max-h-48 overflow-y-auto">
                              {isAdmin.map((ch, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-green-500/5 transition-colors">
                                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  </div>
                                  <span className="text-sm text-foreground truncate flex-1">
                                    {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                                  </span>
                                  <div className="flex gap-1 flex-wrap justify-end">
                                    {ch.bot_permissions.includes("restrict_members") && (
                                      <span className="text-[9px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded">🔒</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="glass-card p-5 md:p-6 border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-foreground">{t("dash.kickNonSubscribers")}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("dash.kickNonSubscribersHint")}</p>
                  </div>
                </div>
                {/* Channel selector */}
                <div className="mb-4">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    {lang === "ar" ? "اختر القناة" : "Select Channel"}
                  </Label>
                  <Select value={kickNonSubsChannelId} onValueChange={setKickNonSubsChannelId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "ar" ? "🌐 كل القنوات" : "🌐 All Channels"}</SelectItem>
                      {channels.map(ch => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/10 mb-4">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive">{t("dash.kickNonSubscribersWarn")}</p>
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={kickingNonSubs}
                  onClick={async () => {
                    if (!confirm(t("dash.kickNonSubscribersConfirm"))) return;
                    setKickingNonSubs(true);
                    setKickNonSubsResult(null);
                    setKickNonSubsActiveChannel(0);
                    const progressInterval = setInterval(() => {
                      setKickNonSubsActiveChannel(prev => prev < channels.length - 1 ? prev + 1 : prev);
                    }, 3000);
                    try {
                      const body: any = { action: "kick_non_subscribers" };
                      if (kickNonSubsChannelId !== "all") body.target_channel_id = kickNonSubsChannelId;
                      const { data, error } = await supabase.functions.invoke("manage-bot", { body });
                      clearInterval(progressInterval);
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      setKickNonSubsResult(data);
                      setKickNonSubsActiveChannel(-1);
                      await fetchData();
                    } catch (error: any) {
                      clearInterval(progressInterval);
                      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                      setKickNonSubsActiveChannel(-1);
                    } finally { setKickingNonSubs(false); }
                  }}
                >
                  {kickingNonSubs ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("dash.kickNonSubscribersProcessing")}
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      {t("dash.kickNonSubscribers")}
                    </>
                  )}
                </Button>
              </div>

              {/* KICK ALL MEMBERS */}
              <div className="glass-card p-5 md:p-6 border-destructive/30 bg-gradient-to-br from-destructive/10 to-transparent">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-foreground">
                      {lang === "ar" ? "طرد الكل من القنوات" : "Kick All From Channels"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "ar" ? "طرد جميع الأعضاء من كل القنوات باستثناء مشرفي القنوات" : "Kick all members from all channels except channel admins"}
                    </p>
                  </div>
                </div>
                {/* Channel selector */}
                <div className="mb-4">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    {lang === "ar" ? "اختر القناة" : "Select Channel"}
                  </Label>
                  <Select value={kickAllChannelId} onValueChange={setKickAllChannelId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "ar" ? "🌐 كل القنوات" : "🌐 All Channels"}</SelectItem>
                      {channels.map(ch => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-4">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive font-medium">
                    {lang === "ar" ? "⚠️ تحذير: سيتم طرد الجميع بما فيهم المشتركين! هذا الإجراء لا يمكن التراجع عنه." : "⚠️ Warning: This will kick EVERYONE including subscribers! This cannot be undone."}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={kickingAllMembers || kickingNonSubs}
                  onClick={async () => {
                    const msg = lang === "ar"
                      ? "⚠️ هل أنت متأكد؟ سيتم طرد جميع الأعضاء من كل القنوات باستثناء المشرفين فقط!"
                      : "⚠️ Are you sure? This will kick ALL members from all channels except admins!";
                    if (!confirm(msg)) return;
                    setKickingAllMembers(true);
                    setKickAllResult(null);
                    setKickAllActiveChannel(0);
                    const progressInterval = setInterval(() => {
                      setKickAllActiveChannel(prev => prev < channels.length - 1 ? prev + 1 : prev);
                    }, 3000);
                    try {
                      const body: any = { action: "kick_all_members" };
                      if (kickAllChannelId !== "all") body.target_channel_id = kickAllChannelId;
                      const { data, error } = await supabase.functions.invoke("manage-bot", { body });
                      clearInterval(progressInterval);
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      setKickAllResult(data);
                      setKickAllActiveChannel(-1);
                      await fetchData();
                    } catch (error: any) {
                      clearInterval(progressInterval);
                      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                      setKickAllActiveChannel(-1);
                    } finally { setKickingAllMembers(false); }
                  }}
                >
                  {kickingAllMembers ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {lang === "ar" ? "جاري طرد الجميع..." : "Kicking all..."}
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      {lang === "ar" ? "طرد الكل من القنوات" : "Kick All From Channels"}
                    </>
                  )}
                </Button>
              </div>

              {/* Kick All - Live scanning */}
              {kickingAllMembers && !kickAllResult && (
                <div className="glass-card p-5 animate-fade-in">
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="w-5 h-5 animate-spin text-destructive" />
                    <h4 className="text-sm font-semibold text-foreground">
                      {lang === "ar" ? "جاري طرد الجميع من القنوات..." : "Kicking all from channels..."}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {channels.map((ch, idx) => (
                      <div key={ch.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-500 ${
                        idx === kickAllActiveChannel
                          ? "border-destructive/50 bg-destructive/5 shadow-sm shadow-destructive/10"
                          : idx < kickAllActiveChannel
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-border/30 bg-secondary/20 opacity-40"
                      }`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                          idx === kickAllActiveChannel ? "bg-destructive/15" : idx < kickAllActiveChannel ? "bg-green-500/10" : "bg-secondary/30"
                        }`}>
                          {idx === kickAllActiveChannel ? (
                            <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                          ) : idx < kickAllActiveChannel ? (
                            <Shield className="w-4 h-4 text-green-500" />
                          ) : (
                            <Tv className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className={`text-sm truncate flex-1 ${idx === kickAllActiveChannel ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </span>
                        {idx === kickAllActiveChannel && (
                          <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px] animate-pulse flex-shrink-0">
                            {lang === "ar" ? "⟵ جاري الطرد" : "Kicking ⟶"}
                          </Badge>
                        )}
                        {idx < kickAllActiveChannel && (
                          <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px] flex-shrink-0">✓</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Kick All - Results */}
              {kickAllResult && (
                <div className="space-y-4 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-card text-center p-4 border-green-500/20">
                      <div className="text-2xl font-bold text-green-500">{kickAllResult.kicked}</div>
                      <div className="text-xs text-green-500 mt-1">{lang === "ar" ? "تم طردهم" : "Kicked"}</div>
                    </div>
                    <div className="glass-card text-center p-4 border-destructive/20">
                      <div className="text-2xl font-bold text-destructive">{kickAllResult.failed}</div>
                      <div className="text-xs text-destructive mt-1">{lang === "ar" ? "فشل" : "Failed"}</div>
                    </div>
                  </div>
                  {kickAllResult.kicked > 0 && (
                    <div className="glass-card overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-destructive/5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center">
                            <User className="w-4 h-4 text-destructive" />
                          </div>
                          <h4 className="text-sm font-bold text-foreground">
                            {lang === "ar" ? "المطرودون" : "Kicked Users"}
                          </h4>
                        </div>
                        <Badge variant="destructive" className="text-xs">
                          {kickAllResult.kicked_users.length} {lang === "ar" ? "شخص" : "users"}
                        </Badge>
                      </div>
                      <div className="divide-y divide-border/20 max-h-72 overflow-y-auto">
                        {kickAllResult.kicked_users.map((u: any, j: number) => (
                          <div key={j} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-destructive" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-foreground text-sm font-medium truncate">{u.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">ID: {u.telegram_user_id}</p>
                            </div>
                            <Badge variant="destructive" className="text-[10px] flex-shrink-0">
                              {lang === "ar" ? "طُرد" : "Kicked"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {kickAllResult.kicked === 0 && kickAllResult.failed === 0 && (
                    <div className="glass-card p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                        <Shield className="w-6 h-6 text-green-500" />
                      </div>
                      <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا يوجد أعضاء لطردهم" : "No members to kick"}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Live scanning animation */}
              {kickingNonSubs && !kickNonSubsResult && (
                <div className="glass-card p-5 animate-fade-in">
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">
                      {lang === "ar" ? "جاري الانتقال بين القنوات وفحص المشتركين..." : "Moving between channels & checking members..."}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {channels.map((ch, idx) => (
                      <div key={ch.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-500 ${
                        idx === kickNonSubsActiveChannel
                          ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10"
                          : idx < kickNonSubsActiveChannel
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-border/30 bg-secondary/20 opacity-40"
                      }`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                          idx === kickNonSubsActiveChannel ? "bg-primary/15" : idx < kickNonSubsActiveChannel ? "bg-green-500/10" : "bg-secondary/30"
                        }`}>
                          {idx === kickNonSubsActiveChannel ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : idx < kickNonSubsActiveChannel ? (
                            <Shield className="w-4 h-4 text-green-500" />
                          ) : (
                            <Tv className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className={`text-sm truncate flex-1 ${idx === kickNonSubsActiveChannel ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </span>
                        {idx === kickNonSubsActiveChannel && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] animate-pulse flex-shrink-0">
                            {lang === "ar" ? "⟵ جاري الفحص" : "Scanning ⟶"}
                          </Badge>
                        )}
                        {idx < kickNonSubsActiveChannel && (
                          <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px] flex-shrink-0">✓</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results Panel */}
              {kickNonSubsResult && (
                <div className="space-y-4 animate-fade-in">
                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="glass-card text-center p-4">
                      <div className="text-2xl font-bold text-foreground">{kickNonSubsResult.checked}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t("dash.kickNonSubsCheckedLabel")}</div>
                    </div>
                    <div className="glass-card text-center p-4 border-green-500/20">
                      <div className="text-2xl font-bold text-green-500">{kickNonSubsResult.kicked}</div>
                      <div className="text-xs text-green-500 mt-1">{t("dash.kickNonSubsKickedLabel")}</div>
                    </div>
                    <div className="glass-card text-center p-4 border-destructive/20">
                      <div className="text-2xl font-bold text-destructive">{kickNonSubsResult.failed}</div>
                      <div className="text-xs text-destructive mt-1">{lang === "ar" ? "فشل" : "Failed"}</div>
                    </div>
                  </div>

                  {/* All kicked users list */}
                  {kickNonSubsResult.kicked > 0 && (
                    <div className="glass-card overflow-hidden animate-fade-in">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-destructive/5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center">
                            <User className="w-4 h-4 text-destructive" />
                          </div>
                          <h4 className="text-sm font-bold text-foreground">
                            {t("dash.kickNonSubsUsers")}
                          </h4>
                        </div>
                        <Badge variant="destructive" className="text-xs">
                          {kickNonSubsResult.kicked} {lang === "ar" ? "شخص" : "users"}
                        </Badge>
                      </div>
                      <div className="divide-y divide-border/20 max-h-72 overflow-y-auto">
                        {(() => {
                          const allKicked: { telegram_user_id: number; name: string; channel: string }[] = [];
                          kickNonSubsResult.channels_results.forEach((ch: any) => {
                            if (ch.kicked_users) {
                              ch.kicked_users.forEach((u: any) => {
                                if (!allKicked.find(k => k.telegram_user_id === u.telegram_user_id)) {
                                  allKicked.push({ ...u, channel: ch.channel_name });
                                }
                              });
                            }
                          });
                          return allKicked.map((u, j) => (
                            <div key={j} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                <User className="w-4 h-4 text-destructive" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-foreground text-sm font-medium truncate">{u.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">ID: {u.telegram_user_id}</p>
                              </div>
                              <Badge variant="destructive" className="text-[10px] flex-shrink-0">
                                {lang === "ar" ? "طُرد" : "Kicked"}
                              </Badge>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Per-channel breakdown */}
                  {kickNonSubsResult.channels_results.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground px-1">
                        {t("dash.kickNonSubsChannels")}
                      </h4>
                      {kickNonSubsResult.channels_results.map((ch: any, i: number) => (
                        <div key={i} className="glass-card overflow-hidden animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/20">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                ch.kicked > 0 ? "bg-destructive/10" : "bg-green-500/10"
                              }`}>
                                <Shield className={`w-4 h-4 ${ch.kicked > 0 ? "text-destructive" : "text-green-500"}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground truncate">{ch.channel_name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {lang === "ar" ? "فحص" : "Checked"} {ch.checked} · {lang === "ar" ? "طُرد" : "Kicked"} {ch.kicked} · {lang === "ar" ? "فشل" : "Failed"} {ch.failed}
                                </p>
                              </div>
                            </div>
                            {ch.kicked === 0 && ch.failed === 0 && (
                              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px]">
                                {lang === "ar" ? "نظيفة ✓" : "Clean ✓"}
                              </Badge>
                            )}
                            {ch.kicked > 0 && (
                              <Badge variant="destructive" className="text-[10px]">
                                {ch.kicked}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {kickNonSubsResult.kicked === 0 && kickNonSubsResult.failed === 0 && (
                    <div className="glass-card p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                        <Shield className="w-6 h-6 text-green-500" />
                      </div>
                      <p className="text-sm text-muted-foreground">{t("dash.kickNonSubsNone")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "subscribers" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                  <Input placeholder={t("dash.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${dir === "rtl" ? "pr-10" : "pl-10"} bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground`} />
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{activeSubs.length} {t("dash.activeCount")}</p>
                  <Button size="sm" onClick={() => { setAddSubForm({ telegram_user_id: "", telegram_username: "", first_name: "", last_name: "", duration: "30", customDays: "", is_permanent: false, channel_ids: channels.map(c => c.id) }); setShowAddSub(true); }}
                    className="gradient-telegram text-primary-foreground hover:opacity-90">
                    <Plus className="w-4 h-4" />
                    {t("subs.add")}
                  </Button>
                </div>
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

          {/* CHANNELS */}
          {activeTab === "channels" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-sm text-muted-foreground">{channels.length} {t("channels.title")}</p>
              {channels.length === 0 ? (
                <div className="text-center py-16 glass-card">
                  <Tv className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-muted-foreground">{t("channels.noChannels")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lang === "ar" ? "أضف قنوات أو مجموعات عبر البوت أولاً" : "Add channels or groups via the bot first"}
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop */}
                  <div className="glass-card overflow-hidden hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50 hover:bg-transparent">
                          <TableHead className="text-muted-foreground font-medium">{t("channels.name")}</TableHead>
                          <TableHead className="text-muted-foreground font-medium">{t("channels.channelId")}</TableHead>
                          <TableHead className="text-muted-foreground font-medium">{t("channels.inviteLink")}</TableHead>
                          <TableHead className="text-muted-foreground font-medium">{t("channels.addedAt")}</TableHead>
                          <TableHead className="text-muted-foreground font-medium w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {channels.map((ch) => (
                          <TableRow key={ch.id} className="border-border/30 hover:bg-secondary/30">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {ch.channel_type === "group" ? (
                                  <Users className="w-4 h-4 text-success flex-shrink-0" />
                                ) : (
                                  <Tv className="w-4 h-4 text-primary/60 flex-shrink-0" />
                                )}
                                <span className="font-medium text-foreground text-sm">{ch.channel_name}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {ch.channel_type === "group" ? t("channels.group") : t("channels.channel")}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell><span className="font-mono text-xs text-muted-foreground" dir="ltr">{ch.channel_id}</span></TableCell>
                            <TableCell>
                              {ch.invite_link ? (
                                <a href={ch.invite_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                                  <Link className="w-3 h-3" /> {lang === "ar" ? "رابط" : "Link"}
                                </a>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{new Date(ch.created_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => deleteChannel(ch.id)} className="text-muted-foreground hover:text-destructive h-8 w-8">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile */}
                  <div className="space-y-3 md:hidden">
                    {channels.map((ch) => (
                      <div key={ch.id} className="glass-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            {ch.channel_type === "group" ? (
                              <Users className="w-5 h-5 text-success" />
                            ) : (
                              <Tv className="w-5 h-5 text-primary/60" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground text-sm">{ch.channel_name}</p>
                              <Badge variant="outline" className="text-[10px]">
                                {ch.channel_type === "group" ? t("channels.group") : t("channels.channel")}
                              </Badge>
                            </div>
                            <p className="font-mono text-xs text-muted-foreground" dir="ltr">{ch.channel_id}</p>
                            {ch.invite_link && (
                              <a href={ch.invite_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
                                <Link className="w-3 h-3" /> {lang === "ar" ? "رابط الدعوة" : "Invite Link"}
                              </a>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => deleteChannel(ch.id)} className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* BROADCAST */}
          {activeTab === "broadcast" && (
            <div className="space-y-4 md:space-y-6 max-w-xl animate-fade-in">
              <div className="glass-card p-4 md:p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Send className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{t("broadcast.title")}</h3>
                </div>
                {/* Target selector */}
                <div className="space-y-2">
                  <Label className="text-foreground/80">{lang === "ar" ? "الهدف" : "Target"}</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={broadcastTarget === "subscribers" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBroadcastTarget("subscribers")}
                      className={broadcastTarget === "subscribers" ? "gradient-telegram text-primary-foreground" : ""}
                    >
                      <Users className="w-3.5 h-3.5" />
                      {t("broadcast.subsOnly")} ({activeSubs.length})
                    </Button>
                    <Button
                      variant={broadcastTarget === "all_users" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBroadcastTarget("all_users")}
                      className={broadcastTarget === "all_users" ? "gradient-telegram text-primary-foreground" : ""}
                    >
                      <Bot className="w-3.5 h-3.5" />
                      {t("broadcast.allBotUsers")} ({botUsersCount})
                    </Button>
                    <Button
                      variant={broadcastTarget === "channels" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBroadcastTarget("channels")}
                      className={broadcastTarget === "channels" ? "gradient-telegram text-primary-foreground" : ""}
                    >
                      <Tv className="w-3.5 h-3.5" />
                      {lang === "ar" ? "القنوات والمجموعات" : "Channels"} ({channels.length})
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground/80">{t("broadcast.message")}</Label>
                  <Textarea
                    placeholder={t("broadcast.placeholder")}
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    rows={5}
                    className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground">{lang === "ar" ? "يدعم تنسيق Markdown (*عريض*, _مائل_)" : "Supports Markdown formatting (*bold*, _italic_)"}</p>
                </div>
                <Button
                  onClick={handleBroadcast}
                  disabled={broadcasting || !broadcastMsg.trim()}
                  className="w-full gradient-telegram text-primary-foreground hover:opacity-90"
                >
                  {broadcasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {broadcasting ? t("broadcast.sending") : t("broadcast.send")}
                </Button>
                {broadcastResult && (
                  <div className="glass-card p-4 border-primary/30 bg-primary/5">
                    <h4 className="text-sm font-semibold text-foreground mb-2">{t("broadcast.result")}</h4>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-success">{broadcastResult.sent}</p>
                        <p className="text-[10px] text-muted-foreground">{t("broadcast.success")}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-destructive">{broadcastResult.failed}</p>
                        <p className="text-[10px] text-muted-foreground">{t("broadcast.failed")}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{broadcastResult.total}</p>
                        <p className="text-[10px] text-muted-foreground">{t("broadcast.total")}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FREE TRIAL */}
          {activeTab === "free_trial" && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              {/* Toggle Card */}
              <div className="glass-card p-4 md:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("dash.freeTrialEnabled")}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("dash.freeTrialHint")}</p>
                    </div>
                  </div>
                  <Switch checked={freeTrialEnabled} onCheckedChange={async (v) => {
                    setFreeTrialEnabled(v);
                    if (botSettings) {
                      const { error } = await supabase.from("bot_tokens").update({ free_trial_enabled: v } as any).eq("id", botSettings.id);
                      if (error) {
                        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                        setFreeTrialEnabled(!v);
                      } else {
                        toast({ title: v ? (lang === "ar" ? "تم تفعيل التجربة المجانية ✅" : "Free trial enabled ✅") : (lang === "ar" ? "تم تعطيل التجربة المجانية" : "Free trial disabled") });
                      }
                    }
                  }} />
                </div>

                {/* Free Trial Days Setting */}
                {freeTrialEnabled && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground">{lang === "ar" ? "مدة التجربة المجانية (بالأيام)" : "Free trial duration (days)"}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={freeTrialDays}
                          onChange={(e) => setFreeTrialDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
                          className="w-20 h-8 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">{lang === "ar" ? "يوم" : "days"}</span>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={async () => {
                          if (!botSettings) return;
                          const { error } = await supabase.from("bot_tokens").update({ free_trial_days: freeTrialDays } as any).eq("id", botSettings.id);
                          if (error) {
                            toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                          } else {
                            toast({ title: lang === "ar" ? `تم تحديث مدة التجربة إلى ${freeTrialDays} يوم ✅` : `Trial duration updated to ${freeTrialDays} days ✅` });
                          }
                        }}>
                          <Save className="w-3 h-3 mr-1" />
                          {t("common.save")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Trial Users */}
              {(() => {
                const activeTrials = freeTrialUsers.filter(u => new Date(u.expires_at) >= new Date());
                const expiredTrials = freeTrialUsers.filter(u => new Date(u.expires_at) < new Date());

                const renderTrialKickButton = (u: FreeTrialUser) => (
                  <Button variant="ghost" size="icon" disabled={kickingId === u.id}
                    className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0"
                    onClick={async () => {
                      if (!confirm(lang === "ar" ? "هل تريد طرد هذا المستخدم؟" : "Kick this user?")) return;
                      setKickingId(u.id);
                      try {
                        const { data, error } = await supabase.functions.invoke("manage-bot", {
                          body: { action: "kick_trial_user", telegram_user_id: u.telegram_user_id },
                        });
                        if (error) throw error;
                        if (data?.error) throw new Error(data.error);
                        // Move to expired by setting expires_at to now
                        await supabase.from("free_trial_users").update({ expires_at: new Date().toISOString() }).eq("id", u.id);
                        toast({ title: lang === "ar" ? "تم طرد المستخدم ونقله إلى المنتهية ✅" : "User kicked and moved to expired ✅" });
                        fetchData();
                      } catch (error: any) {
                        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                      } finally { setKickingId(null); }
                    }}>
                    {kickingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                );

                const renderDeleteRecordButton = (u: FreeTrialUser) => (
                  <Button variant="ghost" size="icon"
                    className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0"
                    onClick={async () => {
                      
                      try {
                        const { error } = await supabase.from("free_trial_users").delete().eq("id", u.id);
                        if (error) throw error;
                        toast({ title: lang === "ar" ? "تم حذف السجل ✅" : "Record deleted ✅" });
                        fetchData();
                      } catch (error: any) {
                        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
                      }
                    }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                );

                return (
                  <>
                    {/* Active Trials Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className="bg-success/20 text-success border-success/30">{activeTrials.length}</Badge>
                        <p className="text-sm font-medium text-foreground">{lang === "ar" ? "مستفيدون حاليًا" : "Currently Active"}</p>
                      </div>
                      {activeTrials.length === 0 ? (
                        <div className="text-center py-8 glass-card">
                          <p className="text-muted-foreground text-sm">{lang === "ar" ? "لا يوجد مستفيدون حاليًا" : "No active trial users"}</p>
                        </div>
                      ) : (
                        <>
                          <div className="glass-card overflow-hidden hidden md:block">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-border/50 hover:bg-transparent">
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.subscriber")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.id")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.trialActivatedAt")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.trialExpiresAt")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{lang === "ar" ? "متبقي" : "Remaining"}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium w-12"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {activeTrials.map(u => {
                                  const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ");
                                  return (
                                    <TableRow key={u.id} className="border-border/30 hover:bg-secondary/30">
                                      <TableCell>
                                        <div>
                                          <p className="font-medium text-foreground text-sm">{displayName || `${t("dash.user")} ${u.telegram_user_id}`}</p>
                                          {u.telegram_username && <p className="text-xs text-muted-foreground" dir="ltr">@{u.telegram_username}</p>}
                                        </div>
                                      </TableCell>
                                      <TableCell><span className="font-mono text-xs text-muted-foreground" dir="ltr">{u.telegram_user_id}</span></TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{new Date(u.activated_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{new Date(u.expires_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</TableCell>
                                      <TableCell>
                                        <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
                                          {daysRemaining(u.expires_at)} {t("dash.day")}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>{renderTrialKickButton(u)}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          <div className="space-y-3 md:hidden">
                            {activeTrials.map(u => {
                              const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ");
                              return (
                                <div key={u.id} className="glass-card p-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="font-medium text-foreground text-sm truncate">{displayName || `${t("dash.user")} ${u.telegram_user_id}`}</p>
                                        <Badge className="bg-success/20 text-success border-success/30 text-[10px] flex-shrink-0">
                                          {daysRemaining(u.expires_at)} {t("dash.day")}
                                        </Badge>
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                        <span className="font-mono" dir="ltr">{u.telegram_user_id}</span>
                                        {u.telegram_username && <span dir="ltr">@{u.telegram_username}</span>}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{t("dash.trialExpiresAt")}: {new Date(u.expires_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</p>
                                    </div>
                                    {renderTrialKickButton(u)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Expired Trials Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className="bg-destructive/20 text-destructive border-destructive/30">{expiredTrials.length}</Badge>
                        <p className="text-sm font-medium text-foreground">{lang === "ar" ? "منتهية الصلاحية" : "Expired Trials"}</p>
                      </div>
                      {expiredTrials.length === 0 ? (
                        <div className="text-center py-8 glass-card">
                          <p className="text-muted-foreground text-sm">{lang === "ar" ? "لا يوجد تجارب منتهية" : "No expired trials"}</p>
                        </div>
                      ) : (
                        <>
                          <div className="glass-card overflow-hidden hidden md:block">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-border/50 hover:bg-transparent">
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.subscriber")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.id")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.trialActivatedAt")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.trialExpiresAt")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium">{t("dash.status")}</TableHead>
                                  <TableHead className="text-muted-foreground font-medium w-12"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {expiredTrials.map(u => {
                                  const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ");
                                  return (
                                    <TableRow key={u.id} className="border-border/30 hover:bg-secondary/30">
                                      <TableCell>
                                        <div>
                                          <p className="font-medium text-foreground text-sm">{displayName || `${t("dash.user")} ${u.telegram_user_id}`}</p>
                                          {u.telegram_username && <p className="text-xs text-muted-foreground" dir="ltr">@{u.telegram_username}</p>}
                                        </div>
                                      </TableCell>
                                      <TableCell><span className="font-mono text-xs text-muted-foreground" dir="ltr">{u.telegram_user_id}</span></TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{new Date(u.activated_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{new Date(u.expires_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</TableCell>
                                      <TableCell>
                                        <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">
                                          {t("dash.expiredBadge")}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>{renderDeleteRecordButton(u)}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          <div className="space-y-3 md:hidden">
                            {expiredTrials.map(u => {
                              const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ");
                              return (
                                <div key={u.id} className="glass-card p-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="font-medium text-foreground text-sm truncate">{displayName || `${t("dash.user")} ${u.telegram_user_id}`}</p>
                                        <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px] flex-shrink-0">
                                          {t("dash.expiredBadge")}
                                        </Badge>
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                        <span className="font-mono" dir="ltr">{u.telegram_user_id}</span>
                                        {u.telegram_username && <span dir="ltr">@{u.telegram_username}</span>}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{t("dash.trialActivatedAt")}: {new Date(u.activated_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</p>
                                    </div>
                                    {renderDeleteRecordButton(u)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* SCAN LOGS */}
          {activeTab === "scan_logs" && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              <div className="glass-card p-5 md:p-6 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-foreground">{t("scanLogs.title")}</h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchScanLogs} disabled={scanLogsLoading}>
                    <RefreshCw className={`w-4 h-4 ${scanLogsLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>

                {scanLogsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : scanLogs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">{t("scanLogs.empty")}</p>
                ) : (
                  <div className="space-y-3">
                    {scanLogs.map((log) => {
                      const details = log.details || {};
                      const total = log.kicked_non_subscribers + log.kicked_expired;
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <div key={log.id} className="glass-card p-4 border-border/50">
                          <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${total > 0 ? "bg-destructive" : "bg-green-500"}`} />
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {new Date(log.created_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {details.channels_scanned ? `${t("scanLogs.channels")}: ${details.channels_scanned}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {total === 0 ? (
                                <Badge variant="outline" className="text-green-600 border-green-300 text-xs">{t("scanLogs.noKicks")}</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">{t("scanLogs.total")}: {total}</Badge>
                              )}
                              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <Shield className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">{t("scanLogs.nonSubs")}:</span>
                                  <span className="font-medium text-foreground">{log.kicked_non_subscribers}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">{t("scanLogs.expired")}:</span>
                                  <span className="font-medium text-foreground">{log.kicked_expired}</span>
                                </div>
                              </div>

                              {details.kicked_non_subscribers_list?.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("scanLogs.nonSubs")} ({details.kicked_non_subscribers_list.length}):</p>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {details.kicked_non_subscribers_list.map((u: any, i: number) => (
                                      <div key={i} className="text-xs text-foreground flex items-center gap-1">
                                        <User className="w-3 h-3 text-muted-foreground" />
                                        {u.name} <span className="text-muted-foreground">({u.telegram_user_id})</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {details.kicked_expired_list?.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("scanLogs.expired")} ({details.kicked_expired_list.length}):</p>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {details.kicked_expired_list.map((u: any, i: number) => (
                                      <div key={i} className="text-xs text-foreground flex items-center gap-1">
                                        <User className="w-3 h-3 text-muted-foreground" />
                                        {u.name} <span className="text-muted-foreground">({u.telegram_user_id})</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}


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
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-2">
                    <Link className="w-4 h-4" />{t("dash.publicChannel")}
                  </Label>
                  <Select value={publicChannelId || "none"} onValueChange={(v) => setPublicChannelId(v === "none" ? null : v)}>
                    <SelectTrigger className="bg-secondary/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("dash.publicChannelNone")}</SelectItem>
                      {channels.map(ch => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("dash.publicChannelHint")}</p>
                  {publicChannelId && publicChannelId !== "none" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("dash.publicMembers")}: <strong>{publicMembersCount}</strong> — {lang === "ar" ? "يمكنك طردهم من لوحة التحكم الرئيسية" : "You can kick them from the overview tab"}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />{t("dash.subscribersChannel")}
                  </Label>
                  <Select value={subscribersChannelId || "none"} onValueChange={(v) => setSubscribersChannelId(v === "none" ? null : v)}>
                    <SelectTrigger className="bg-secondary/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("dash.subscribersChannelNone")}</SelectItem>
                      {channels.map(ch => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("dash.subscribersChannelHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-2">
                    <Shield className="w-4 h-4" />{t("dash.mandatoryChannel")}
                  </Label>
                  <Select value={mandatoryChannelId || "none"} onValueChange={(v) => setMandatoryChannelId(v === "none" ? null : v)}>
                    <SelectTrigger className="bg-secondary/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("dash.mandatoryChannelNone")}</SelectItem>
                      {channels.map(ch => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("dash.mandatoryChannelHint")}</p>
                  <div className="flex-1">
                    <Label className="text-foreground/80 flex items-center gap-2">
                      <Zap className="w-4 h-4" />{t("dash.freeTrialEnabled")}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">{t("dash.freeTrialHint")}</p>
                  </div>
                   <Switch checked={freeTrialEnabled} onCheckedChange={setFreeTrialEnabled} />
                </div>
                {freeTrialEnabled && (
                  <div className="space-y-2">
                    <Label className="text-foreground/80 flex items-center gap-2">
                      <Tv className="w-4 h-4" />{lang === "ar" ? "قنوات الاشتراك التجريبي" : "Trial Channels"}
                    </Label>
                    <p className="text-xs text-muted-foreground">{lang === "ar" ? "اختر القنوات التي يحصل عليها المشترك التجريبي. إذا لم تختر شيئاً سيحصل على جميع القنوات." : "Select channels for trial users. If none selected, they get all channels."}</p>
                    <div className="flex items-center gap-2 mb-1">
                      <Checkbox
                        checked={freeTrialChannelIds.length === channels.length && channels.length > 0}
                        onCheckedChange={(v) => setFreeTrialChannelIds(v ? channels.map(c => c.id) : [])}
                      />
                      <span className="text-sm text-foreground">{t("subs.allChannels")}</span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {channels.map(ch => (
                        <div key={ch.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={freeTrialChannelIds.includes(ch.id)}
                            onCheckedChange={() => setFreeTrialChannelIds(prev => prev.includes(ch.id) ? prev.filter(id => id !== ch.id) : [...prev, ch.id])}
                          />
                          <span className="text-sm text-foreground">{ch.channel_type === "group" ? "👥" : "📺"} {ch.channel_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
                <div className="glass-card p-4 md:p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-foreground">{t("scanLogs.autoScan")}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("scanLogs.autoScanHint")}</p>
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground/80">{t("scanLogs.autoScan")}</Label>
                    <Switch checked={autoScanEnabled} onCheckedChange={setAutoScanEnabled} />
                  </div>
                  {autoScanEnabled && (
                    <div className="space-y-2">
                      <Label className="text-foreground/80">{t("scanLogs.interval")}</Label>
                      <Select value={String(autoScanInterval)} onValueChange={(v) => setAutoScanInterval(parseInt(v))}>
                        <SelectTrigger className="bg-secondary/50 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 {t("dash.minute")}</SelectItem>
                          <SelectItem value="30">30 {t("dash.minute")}</SelectItem>
                          <SelectItem value="60">60 {t("dash.minute")}</SelectItem>
                          <SelectItem value="120">120 {t("dash.minute")}</SelectItem>
                          <SelectItem value="360">360 {t("dash.minute")}</SelectItem>
                          <SelectItem value="720">720 {t("dash.minute")}</SelectItem>
                          <SelectItem value="1440">1440 {t("dash.minute")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t("scanLogs.intervalHint")}</p>
                    </div>
                  )}
                </div>
                <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full gradient-telegram text-primary-foreground hover:opacity-90">
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                  {t("dash.saveSettings")}
                </Button>
            </div>
          )}
        </div>
      </main>

      {/* ── Add Subscriber Dialog ── */}
      <Dialog open={showAddSub} onOpenChange={setShowAddSub}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              {t("subs.add")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "ar" ? "أدخل بيانات المشترك الجديد" : "Enter new subscriber details"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("subs.telegramId")} *</Label>
              <Input dir="ltr" placeholder="123456789" value={addSubForm.telegram_user_id}
                onChange={(e) => setAddSubForm(p => ({ ...p, telegram_user_id: e.target.value }))}
                className="bg-secondary/50 border-border/50 text-foreground font-mono text-left" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("subs.firstName")}</Label>
                <Input value={addSubForm.first_name} onChange={(e) => setAddSubForm(p => ({ ...p, first_name: e.target.value }))}
                  className="bg-secondary/50 border-border/50 text-foreground" />
              </div>
              <div className="space-y-2">
                <Label>{t("subs.lastName")}</Label>
                <Input value={addSubForm.last_name} onChange={(e) => setAddSubForm(p => ({ ...p, last_name: e.target.value }))}
                  className="bg-secondary/50 border-border/50 text-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("subs.username")}</Label>
              <Input dir="ltr" placeholder="username" value={addSubForm.telegram_username}
                onChange={(e) => setAddSubForm(p => ({ ...p, telegram_username: e.target.value }))}
                className="bg-secondary/50 border-border/50 text-foreground text-left" />
            </div>
            <div className="space-y-2">
              <Label>{t("subs.selectDuration")}</Label>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox checked={addSubForm.is_permanent} onCheckedChange={(v) => setAddSubForm(p => ({ ...p, is_permanent: !!v }))} />
                <span className="text-sm text-foreground">{t("subs.permanentOption")} ♾</span>
              </div>
              {!addSubForm.is_permanent && (
                <div className="space-y-2">
                  <Select value={addSubForm.duration} onValueChange={(v) => setAddSubForm(p => ({ ...p, duration: v }))}>
                    <SelectTrigger className="bg-secondary/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[7, 15, 30, 60, 90, 180, 365].map(d => (
                        <SelectItem key={d} value={d.toString()}>{d} {t("dash.day")}</SelectItem>
                      ))}
                      <SelectItem value="custom">{t("subs.customDays")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {addSubForm.duration === "custom" && (
                    <Input type="number" min="1" max="9999" placeholder="1-9999" value={addSubForm.customDays}
                      onChange={(e) => setAddSubForm(p => ({ ...p, customDays: e.target.value }))}
                      className="bg-secondary/50 border-border/50 text-foreground" dir="ltr" />
                  )}
                </div>
              )}
            </div>
            {channels.length > 0 && (
              <div className="space-y-2">
                <Label>{t("subs.selectChannels")}</Label>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    checked={addSubForm.channel_ids.length === channels.length}
                    onCheckedChange={(v) => setAddSubForm(p => ({ ...p, channel_ids: v ? channels.map(c => c.id) : [] }))}
                  />
                  <span className="text-sm text-foreground">{t("subs.allChannels")}</span>
                </div>
                {channels.length > 6 && (
                  <Input placeholder={t("subs.searchChannels")} value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)}
                    className="bg-secondary/50 border-border/50 text-foreground text-sm h-8" />
                )}
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {channels.filter(ch => !channelSearch || ch.channel_name.toLowerCase().includes(channelSearch.toLowerCase())).map(ch => (
                    <div key={ch.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={addSubForm.channel_ids.includes(ch.id)}
                        onCheckedChange={() => toggleAddSubChannel(ch.id)}
                      />
                      <span className="text-sm text-foreground">{ch.channel_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSub(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleAddSubscriber} disabled={addingSubscriber || !addSubForm.telegram_user_id.trim()}
              className="gradient-telegram text-primary-foreground">
              {addingSubscriber ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {t("subs.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Channels Dialog ── */}
      <Dialog open={!!editChannelsSub} onOpenChange={(v) => { if (!v) setEditChannelsSub(null); }}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" />
              {t("subs.editChannels")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editChannelsSub && (getDisplayName(editChannelsSub) || `${t("dash.user")} ${editChannelsSub.telegram_user_id}`)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Checkbox
                checked={editChannelIds.length === channels.length && channels.length > 0}
                onCheckedChange={(v) => setEditChannelIds(v ? channels.map(c => c.id) : [])}
              />
              <span className="text-sm font-medium text-foreground">{t("subs.allChannels")}</span>
            </div>
            {channels.length > 6 && (
              <Input placeholder={t("subs.searchChannels")} value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)}
                className="bg-secondary/50 border-border/50 text-foreground text-sm h-8" />
            )}
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {channels.filter(ch => !channelSearch || ch.channel_name.toLowerCase().includes(channelSearch.toLowerCase())).map(ch => (
                <div key={ch.id} className="flex items-center gap-2">
                  <Checkbox checked={editChannelIds.includes(ch.id)} onCheckedChange={() => toggleEditChannel(ch.id)} />
                  <span className="text-sm text-foreground">{ch.channel_name}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChannelsSub(null)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSaveSubChannels} disabled={savingChannels}
              className="gradient-telegram text-primary-foreground">
              {savingChannels ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t("dash.saveSettings")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
