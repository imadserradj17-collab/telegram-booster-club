import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Shield, CheckCircle, XCircle, Loader2, Users, LogOut, ArrowRight, Calendar,
} from "lucide-react";

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

const AdminPanel = ({ onGoToDashboard }: AdminPanelProps) => {
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [daysInput, setDaysInput] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_users_with_email");
    if (data) setUsers(data as UserWithEmail[]);
    if (error) console.error(error);
    setLoading(false);
  };

  const activateUser = async (userId: string) => {
    const days = parseInt(daysInput[userId] || "");
    if (isNaN(days) || days <= 0) {
      toast({ title: "خطأ", description: "أدخل عدد أيام صحيح", variant: "destructive" });
      return;
    }
    setUpdating(userId);
    try {
      const approvedUntil = new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: true, approved_until: approvedUntil })
        .eq("id", userId);
      if (error) throw error;
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_approved: true, approved_until: approvedUntil } : u))
      );
      setDaysInput((prev) => ({ ...prev, [userId]: "" }));
      toast({ title: `تم تفعيل الحساب لمدة ${days} يوم ✅` });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const deactivateUser = async (userId: string) => {
    setUpdating(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: false, approved_until: null })
        .eq("id", userId);
      if (error) throw error;
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_approved: false, approved_until: null } : u))
      );
      toast({ title: "تم تعطيل الحساب ❌" });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

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

  const pendingCount = users.filter((u) => !u.is_approved).length;
  const approvedCount = users.filter((u) => u.is_approved && !isExpired(u)).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-30 flex items-center px-4 md:px-6 gap-3">
        <Shield className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">لوحة الأدمن</h1>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onGoToDashboard} className="text-primary">
          <ArrowRight className="w-4 h-4 ml-1" />
          لوحة التحكم
        </Button>
        <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
          <LogOut className="w-4 h-4" />
        </Button>
      </header>

      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <Users className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">في انتظار الموافقة</p>
          </div>
          <div className="glass-card p-4">
            <CheckCircle className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
            <p className="text-xs text-muted-foreground">مفعّل</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="glass-card overflow-hidden hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">البريد الإلكتروني</TableHead>
                    <TableHead className="text-right text-muted-foreground">تاريخ التسجيل</TableHead>
                    <TableHead className="text-right text-muted-foreground">الحالة</TableHead>
                    <TableHead className="text-right text-muted-foreground">المدة المتبقية</TableHead>
                    <TableHead className="text-right text-muted-foreground w-64">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const remaining = getRemainingDays(user.approved_until);
                    const expired = isExpired(user);
                    return (
                      <TableRow key={user.id} className="border-border/30 hover:bg-secondary/30">
                        <TableCell>
                          <span className="text-sm text-foreground" dir="ltr">{user.email}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString("ar-EG")}
                        </TableCell>
                        <TableCell>
                          {expired ? (
                            <Badge variant="destructive" className="text-[10px]">منتهي</Badge>
                          ) : user.is_approved ? (
                            <Badge className="bg-success/20 text-success border-success/30 text-[10px] hover:bg-success/20">مفعّل</Badge>
                          ) : (
                            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] hover:bg-primary/20">معلّق</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.is_approved && remaining !== null ? (
                            remaining > 0 ? `${remaining} يوم` : "منتهي"
                          ) : user.is_approved ? "—" : "—"}
                        </TableCell>
                        <TableCell>
                          {updating === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          ) : user.is_approved && !expired ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deactivateUser(user.id)}
                              className="text-destructive hover:text-destructive text-xs h-8"
                            >
                              <XCircle className="w-3.5 h-3.5 ml-1" />
                              تعطيل
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                placeholder="عدد الأيام"
                                value={daysInput[user.id] || ""}
                                onChange={(e) => setDaysInput((prev) => ({ ...prev, [user.id]: e.target.value }))}
                                className="w-24 h-8 text-xs bg-secondary/50 border-border/50 text-foreground"
                                min={1}
                                dir="ltr"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => activateUser(user.id)}
                                className="text-success hover:text-success text-xs h-8"
                              >
                                <CheckCircle className="w-3.5 h-3.5 ml-1" />
                                تفعيل
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
              {users.map((user) => {
                const remaining = getRemainingDays(user.approved_until);
                const expired = isExpired(user);
                return (
                  <div key={user.id} className="glass-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate" dir="ltr">{user.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {expired ? (
                            <Badge variant="destructive" className="text-[10px]">منتهي</Badge>
                          ) : user.is_approved ? (
                            <Badge className="bg-success/20 text-success border-success/30 text-[10px] hover:bg-success/20">مفعّل</Badge>
                          ) : (
                            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] hover:bg-primary/20">معلّق</Badge>
                          )}
                          {user.is_approved && remaining !== null && remaining > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {remaining} يوم
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString("ar-EG")}
                          </span>
                        </div>
                      </div>
                      {updating === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
                      ) : user.is_approved && !expired ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deactivateUser(user.id)}
                          className="text-destructive hover:text-destructive text-xs h-8 flex-shrink-0"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    {(!user.is_approved || expired) && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="عدد الأيام"
                          value={daysInput[user.id] || ""}
                          onChange={(e) => setDaysInput((prev) => ({ ...prev, [user.id]: e.target.value }))}
                          className="flex-1 h-8 text-xs bg-secondary/50 border-border/50 text-foreground"
                          min={1}
                          dir="ltr"
                        />
                        <Button
                          size="sm"
                          onClick={() => activateUser(user.id)}
                          className="gradient-telegram text-primary-foreground text-xs h-8"
                        >
                          <CheckCircle className="w-3.5 h-3.5 ml-1" />
                          تفعيل
                        </Button>
                      </div>
                    )}
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
