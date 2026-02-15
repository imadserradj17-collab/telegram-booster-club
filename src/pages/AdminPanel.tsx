import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  Search, RefreshCw, Clock, Filter,
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

interface AdminPanelProps {
  onGoToDashboard: () => void;
}

type StatusFilter = "all" | "pending" | "active" | "expired";

const AdminPanel = ({ onGoToDashboard }: AdminPanelProps) => {
  const { t, lang, dir } = useLanguage();
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [daysInput, setDaysInput] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkDays, setBulkDays] = useState("");

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_users_with_email");
    if (data) setUsers(data as UserWithEmail[]);
    if (error) console.error(error);
    setLoading(false);
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

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <header className="h-16 border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-30 flex items-center px-4 md:px-6 gap-3">
        <Shield className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("admin.title")}</h1>
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
      </div>
    </div>
  );
};

export default AdminPanel;
