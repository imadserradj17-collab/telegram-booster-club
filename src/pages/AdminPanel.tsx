import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Shield, CheckCircle, XCircle, Loader2, Users, LogOut, ArrowRight, Calendar,
  Search, RefreshCw, Clock, UserPlus, ScrollText, UserCog, Trash2,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

interface UserWithEmail {
  id: string;
  email: string;
  created_at: string;
  is_approved: boolean;
  approved_until: string | null;
}

interface Moderator {
  user_id: string;
  email: string;
  added_at: string | null;
}

interface ActivityRow {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_label: string | null;
  details: any;
  created_at: string;
}

interface AdminPanelProps {
  onGoToDashboard: () => void;
  role: "admin" | "moderator";
}

type StatusFilter = "all" | "pending" | "active" | "expired";
type Tab = "users" | "moderators" | "activity";

const logAction = async (
  action: string,
  targetUserId: string | null,
  targetLabel: string | null,
  details: Record<string, any> = {},
) => {
  try {
    await supabase.rpc("log_admin_action", {
      _action: action,
      _target_user_id: targetUserId,
      _target_label: targetLabel,
      _details: details as any,
    });
  } catch (e) {
    console.error("log_admin_action failed", e);
  }
};

const AdminPanel = ({ onGoToDashboard, role }: AdminPanelProps) => {
  const { t, lang, dir } = useLanguage();
  const isAdmin = role === "admin";

  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [daysInput, setDaysInput] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkDays, setBulkDays] = useState("");

  // Moderators
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [modPick, setModPick] = useState<string>("");
  const [modBusy, setModBusy] = useState(false);

  // Activity
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => {
    if (tab === "moderators" && isAdmin) fetchModerators();
    if (tab === "activity") fetchActivity();
  }, [tab, isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_users_with_email");
    if (data) setUsers(data as UserWithEmail[]);
    if (error) console.error(error);
    setLoading(false);
  };

  const fetchModerators = async () => {
    const { data, error } = await supabase.rpc("get_moderators" as any);
    if (error) console.error(error);
    if (data) setModerators(data as Moderator[]);
  };

  const fetchActivity = async () => {
    setActivityLoading(true);
    const { data, error } = await supabase
      .from("admin_activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) console.error(error);
    if (data) setActivity(data as ActivityRow[]);
    setActivityLoading(false);
  };

  const activateUser = async (userId: string, days?: number) => {
    const d = days || parseInt(daysInput[userId] || "");
    if (isNaN(d) || d <= 0) {
      toast({ title: t("common.error"), description: t("admin.invalidDays"), variant: "destructive" });
      return;
    }
    setUpdating(userId);
    try {
      const approvedUntil = new Date(Date.now() + d * 86400000).toISOString();
      const { error } = await supabase.from("profiles").update({ is_approved: true, approved_until: approvedUntil }).eq("id", userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_approved: true, approved_until: approvedUntil } : u)));
      setDaysInput((prev) => ({ ...prev, [userId]: "" }));
      const target = users.find((u) => u.id === userId);
      await logAction("activate_user", userId, target?.email || null, { days: d });
      toast({ title: `${t("admin.activatedMsg")} ${d} ${t("admin.daysCount")} ✅` });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setUpdating(null); }
  };

  const deactivateUser = async (userId: string) => {
    setUpdating(userId);
    try {
      const { error } = await supabase.from("profiles").update({ is_approved: false, approved_until: null }).eq("id", userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_approved: false, approved_until: null } : u)));
      const target = users.find((u) => u.id === userId);
      await logAction("deactivate_user", userId, target?.email || null, {});
      toast({ title: t("admin.deactivatedMsg") });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally { setUpdating(null); }
  };

  const handleBulkActivate = async () => {
    const days = parseInt(bulkDays);
    if (isNaN(days) || days <= 0 || selectedUsers.size === 0) return;
    for (const userId of selectedUsers) {
      await activateUser(userId, days);
    }
    setSelectedUsers(new Set());
    setBulkDays("");
  };

  const handleBulkDeactivate = async () => {
    if (selectedUsers.size === 0) return;
    for (const userId of selectedUsers) {
      await deactivateUser(userId);
    }
    setSelectedUsers(new Set());
  };

  const toggleSelect = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const promoteModerator = async () => {
    if (!modPick) return;
    if (moderators.some((m) => m.user_id === modPick)) {
      toast({ title: t("admin.alreadyModerator"), variant: "destructive" });
      return;
    }
    setModBusy(true);
    try {
      const { error } = await supabase.from("user_roles").insert({ user_id: modPick, role: "moderator" as any });
      if (error) throw error;
      const target = users.find((u) => u.id === modPick);
      await logAction("promote_moderator", modPick, target?.email || null, {});
      setModPick("");
      await fetchModerators();
      toast({ title: t("admin.promoted") });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally { setModBusy(false); }
  };

  const demoteModerator = async (m: Moderator) => {
    if (!confirm(t("admin.confirmDemote"))) return;
    setModBusy(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", m.user_id)
        .eq("role", "moderator" as any);
      if (error) throw error;
      await logAction("demote_moderator", m.user_id, m.email, {});
      await fetchModerators();
      toast({ title: t("admin.demoted") });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally { setModBusy(false); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const getRemainingDays = (approvedUntil: string | null) => {
    if (!approvedUntil) return null;
    const remaining = Math.ceil((new Date(approvedUntil).getTime() - Date.now()) / 86400000);
    return remaining > 0 ? remaining : 0;
  };

  const isExpired = (user: UserWithEmail) => {
    if (!user.is_approved) return false;
    if (!user.approved_until) return false;
    return new Date(user.approved_until) < new Date();
  };

  const getStatus = (user: UserWithEmail): "pending" | "active" | "expired" => {
    if (!user.is_approved) return "pending";
    if (isExpired(user)) return "expired";
    return "active";
  };

  const filteredUsers = useMemo(() => {
    let list = users;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u) => u.email.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter((u) => getStatus(u) === statusFilter);
    }
    return list;
  }, [users, searchQuery, statusFilter]);

  const pendingCount = users.filter((u) => !u.is_approved).length;
  const approvedCount = users.filter((u) => u.is_approved && !isExpired(u)).length;
  const expiredCount = users.filter((u) => isExpired(u)).length;

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const filterButtons: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: t("admin.all"), count: users.length },
    { key: "pending", label: t("admin.filterPending"), count: pendingCount },
    { key: "active", label: t("admin.filterActive"), count: approvedCount },
    { key: "expired", label: t("admin.filterExpired"), count: expiredCount },
  ];

  const activeUsers = useMemo(() => users.filter((u) => u.is_approved && !isExpired(u)), [users]);
  const moderatorIds = useMemo(() => new Set(moderators.map((m) => m.user_id)), [moderators]);
  const promotableUsers = useMemo(() => activeUsers.filter((u) => !moderatorIds.has(u.id)), [activeUsers, moderatorIds]);

  const filteredActivity = useMemo(() => {
    if (!activitySearch.trim()) return activity;
    const q = activitySearch.toLowerCase();
    return activity.filter((a) =>
      (a.actor_email || "").toLowerCase().includes(q) ||
      (a.target_label || "").toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q)
    );
  }, [activity, activitySearch]);

  const actionLabel = (a: string) => {
    switch (a) {
      case "activate_user": return t("admin.actionActivate");
      case "deactivate_user": return t("admin.actionDeactivate");
      case "promote_moderator": return t("admin.actionPromote");
      case "demote_moderator": return t("admin.actionDemote");
      default: return a;
    }
  };

  const actionColor = (a: string) => {
    if (a.includes("activate") && !a.includes("de")) return "bg-success/20 text-success border-success/30";
    if (a.includes("deactivate") || a.includes("demote")) return "bg-destructive/20 text-destructive border-destructive/30";
    if (a.includes("promote")) return "bg-primary/20 text-primary border-primary/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString(lang === "ar" ? "ar-EG" : "en-US");

  const tabs: { key: Tab; label: string; icon: any; show: boolean }[] = [
    { key: "users", label: t("admin.tabUsers"), icon: Users, show: true },
    { key: "moderators", label: t("admin.tabModerators"), icon: UserCog, show: isAdmin },
    { key: "activity", label: t("admin.tabActivity"), icon: ScrollText, show: true },
  ];

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <header className="h-16 border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-30 flex items-center px-4 md:px-6 gap-3">
        <Shield className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("admin.title")}</h1>
        {!isAdmin && (
          <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
            {t("admin.tabModerators").replace(/s$/, "")}
          </Badge>
        )}
        <div className="flex-1" />
        <LanguageSwitcher />
        <Button variant="ghost" size="sm" onClick={onGoToDashboard} className="text-primary">
          <ArrowRight className="w-4 h-4 ml-1" />{t("admin.dashboard")}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
          <LogOut className="w-4 h-4" />
        </Button>
      </header>

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/40 overflow-x-auto">
          {tabs.filter((tb) => tb.show).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="glass-card p-4">
                <Users className="w-5 h-5 text-primary mb-2" />
                <p className="text-2xl font-bold text-foreground">{users.length}</p>
                <p className="text-xs text-muted-foreground">{t("admin.totalUsers")}</p>
              </div>
              <div className="glass-card p-4">
                <Clock className="w-5 h-5 text-yellow-400 mb-2" />
                <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">{t("admin.pendingApproval")}</p>
              </div>
              <div className="glass-card p-4">
                <CheckCircle className="w-5 h-5 text-success mb-2" />
                <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">{t("admin.activated")}</p>
              </div>
              <div className="glass-card p-4">
                <XCircle className="w-5 h-5 text-destructive mb-2" />
                <p className="text-2xl font-bold text-foreground">{expiredCount}</p>
                <p className="text-xs text-muted-foreground">{t("admin.expiredCount")}</p>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                <Input
                  placeholder={t("admin.searchEmail")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  dir="ltr"
                  className={`${dir === "rtl" ? "pr-10" : "pl-10"} bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground text-left`}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={fetchUsers} className="text-muted-foreground h-10 w-10 flex-shrink-0">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              {filterButtons.map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => { setStatusFilter(key); setSelectedUsers(new Set()); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    statusFilter === key
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  <span className="bg-background/50 px-1.5 py-0.5 rounded text-[10px] font-mono">{count}</span>
                </button>
              ))}
            </div>

            {/* Bulk Actions */}
            {selectedUsers.size > 0 && (
              <div className="glass-card p-3 border-primary/30 bg-primary/5 animate-fade-in">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <p className="text-sm text-primary font-medium">
                    {selectedUsers.size} {t("admin.selected")}
                  </p>
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="number"
                      placeholder={t("admin.bulkDays")}
                      value={bulkDays}
                      onChange={(e) => setBulkDays(e.target.value)}
                      className="w-28 h-8 text-xs bg-secondary/50 border-border/50 text-foreground"
                      min={1}
                      dir="ltr"
                    />
                    <Button size="sm" onClick={handleBulkActivate} disabled={!bulkDays || parseInt(bulkDays) <= 0}
                      className="text-xs h-8 bg-success/20 text-success hover:bg-success/30 border border-success/30">
                      <CheckCircle className="w-3.5 h-3.5 ml-1" />{t("admin.bulkActivate")}
                    </Button>
                  </div>
                  <Button size="sm" onClick={handleBulkDeactivate}
                    className="text-xs h-8 bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/30">
                    <XCircle className="w-3.5 h-3.5 ml-1" />{t("admin.bulkDeactivate")}
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 glass-card">
                <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-muted-foreground">{t("admin.noResults")}</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="glass-card overflow-hidden hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead className="text-muted-foreground">{t("admin.email")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("admin.regDate")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("admin.status")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("admin.remaining")}</TableHead>
                        <TableHead className="text-muted-foreground w-64">{t("admin.action")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const remaining = getRemainingDays(user.approved_until);
                        const expired = isExpired(user);
                        return (
                          <TableRow key={user.id} className={`border-border/30 hover:bg-secondary/30 ${selectedUsers.has(user.id) ? "bg-primary/5" : ""}`}>
                            <TableCell>
                              <Checkbox checked={selectedUsers.has(user.id)} onCheckedChange={() => toggleSelect(user.id)} />
                            </TableCell>
                            <TableCell><span className="text-sm text-foreground" dir="ltr">{user.email}</span></TableCell>
                            <TableCell className="text-sm text-muted-foreground">{new Date(user.created_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}</TableCell>
                            <TableCell>
                              {expired ? <Badge variant="destructive" className="text-[10px]">{t("admin.expired")}</Badge>
                                : user.is_approved ? <Badge className="bg-success/20 text-success border-success/30 text-[10px] hover:bg-success/20">{t("admin.active")}</Badge>
                                : <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] hover:bg-primary/20">{t("admin.pending")}</Badge>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {user.is_approved && remaining !== null ? (remaining > 0 ? `${remaining} ${t("admin.daysCount")}` : t("admin.expired")) : "—"}
                            </TableCell>
                            <TableCell>
                              {updating === user.id ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                : user.is_approved && !expired ? (
                                  <Button variant="ghost" size="sm" onClick={() => deactivateUser(user.id)} className="text-destructive hover:text-destructive text-xs h-8">
                                    <XCircle className="w-3.5 h-3.5 ml-1" />{t("admin.deactivate")}
                                  </Button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Input type="number" placeholder={t("admin.daysPlaceholder")} value={daysInput[user.id] || ""}
                                      onChange={(e) => setDaysInput((prev) => ({ ...prev, [user.id]: e.target.value }))}
                                      className="w-24 h-8 text-xs bg-secondary/50 border-border/50 text-foreground" min={1} dir="ltr" />
                                    <Button variant="ghost" size="sm" onClick={() => activateUser(user.id)} className="text-success hover:text-success text-xs h-8">
                                      <CheckCircle className="w-3.5 h-3.5 ml-1" />{t("admin.activate")}
                                    </Button>
                                  </div>
                                )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="space-y-3 md:hidden">
                  {filteredUsers.map((user) => {
                    const remaining = getRemainingDays(user.approved_until);
                    const expired = isExpired(user);
                    return (
                      <div key={user.id} className={`glass-card p-4 space-y-3 ${selectedUsers.has(user.id) ? "border-primary/40" : ""}`}>
                        <div className="flex items-start gap-3">
                          <Checkbox checked={selectedUsers.has(user.id)} onCheckedChange={() => toggleSelect(user.id)} className="mt-1" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm text-foreground truncate" dir="ltr">{user.email}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {expired ? <Badge variant="destructive" className="text-[10px]">{t("admin.expired")}</Badge>
                                    : user.is_approved ? <Badge className="bg-success/20 text-success border-success/30 text-[10px] hover:bg-success/20">{t("admin.active")}</Badge>
                                    : <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] hover:bg-primary/20">{t("admin.pending")}</Badge>}
                                  {user.is_approved && remaining !== null && remaining > 0 && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />{remaining} {t("admin.daysCount")}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">{new Date(user.created_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                                </div>
                              </div>
                              {updating === user.id ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
                                : user.is_approved && !expired ? (
                                  <Button variant="ghost" size="sm" onClick={() => deactivateUser(user.id)} className="text-destructive hover:text-destructive text-xs h-8 flex-shrink-0">
                                    <XCircle className="w-3.5 h-3.5" />
                                  </Button>
                                ) : null}
                            </div>
                            {(!user.is_approved || expired) && (
                              <div className="flex items-center gap-2 mt-2">
                                <Input type="number" placeholder={t("admin.daysPlaceholder")} value={daysInput[user.id] || ""}
                                  onChange={(e) => setDaysInput((prev) => ({ ...prev, [user.id]: e.target.value }))}
                                  className="flex-1 h-8 text-xs bg-secondary/50 border-border/50 text-foreground" min={1} dir="ltr" />
                                <Button size="sm" onClick={() => activateUser(user.id)} className="gradient-telegram text-primary-foreground text-xs h-8">
                                  <CheckCircle className="w-3.5 h-3.5 ml-1" />{t("admin.activate")}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {tab === "moderators" && isAdmin && (
          <div className="space-y-4">
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <UserCog className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{t("admin.moderatorsTitle")}</h2>
              </div>
              <p className="text-xs text-muted-foreground">{t("admin.moderatorsHint")}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={modPick}
                  onChange={(e) => setModPick(e.target.value)}
                  className="flex-1 h-10 rounded-md border border-border/50 bg-secondary/50 px-3 text-sm text-foreground"
                  dir="ltr"
                >
                  <option value="">{t("admin.selectUser")}</option>
                  {promotableUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
                <Button onClick={promoteModerator} disabled={!modPick || modBusy} className="gradient-telegram text-primary-foreground">
                  {modBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 ml-1" />}
                  {t("admin.addModerator")}
                </Button>
              </div>
            </div>

            {moderators.length === 0 ? (
              <div className="text-center py-12 glass-card">
                <UserCog className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">{t("admin.noModerators")}</p>
              </div>
            ) : (
              <div className="glass-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-muted-foreground">{t("admin.email")}</TableHead>
                      <TableHead className="text-muted-foreground">{t("admin.addedOn")}</TableHead>
                      <TableHead className="text-muted-foreground w-32">{t("admin.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moderators.map((m) => (
                      <TableRow key={m.user_id} className="border-border/30 hover:bg-secondary/30">
                        <TableCell><span className="text-sm text-foreground" dir="ltr">{m.email}</span></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.added_at ? new Date(m.added_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => demoteModerator(m)}
                            className="text-destructive hover:text-destructive text-xs h-8" disabled={modBusy}>
                            <Trash2 className="w-3.5 h-3.5 ml-1" />{t("admin.demote")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-4">
            <div className="glass-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{t("admin.activityTitle")}</h2>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" onClick={fetchActivity} className="text-muted-foreground h-8 w-8">
                  <RefreshCw className={`w-4 h-4 ${activityLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("admin.activityHint")}</p>
              <div className="relative">
                <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                <Input
                  placeholder={t("admin.filterActor")}
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  className={`${dir === "rtl" ? "pr-10" : "pl-10"} bg-secondary/50 border-border/50 text-foreground`}
                />
              </div>
            </div>

            {activityLoading ? (
              <div className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : filteredActivity.length === 0 ? (
              <div className="text-center py-12 glass-card">
                <ScrollText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">{t("admin.noActivity")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredActivity.map((a) => (
                  <div key={a.id} className="glass-card p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <Badge className={`text-[10px] ${actionColor(a.action)} w-fit`}>{actionLabel(a.action)}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate" dir="ltr">
                        {a.target_label || a.target_user_id || "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        <span className="text-primary" dir="ltr">{a.actor_email || a.actor_id.slice(0, 8)}</span>
                        {a.details && a.details.days ? <> · {a.details.days} {t("admin.days")}</> : null}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
