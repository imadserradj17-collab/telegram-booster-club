import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Shield, CheckCircle, XCircle, Loader2, Users, LogOut, ArrowRight,
} from "lucide-react";

interface UserProfile {
  id: string;
  created_at: string;
  is_approved: boolean;
}

interface AdminPanelProps {
  onGoToDashboard: () => void;
}

const AdminPanel = ({ onGoToDashboard }: AdminPanelProps) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setUsers(data);
    setLoading(false);
  };

  const toggleApproval = async (userId: string, approve: boolean) => {
    setUpdating(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: approve })
        .eq("id", userId);
      if (error) throw error;
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_approved: approve } : u))
      );
      toast({ title: approve ? "تم تفعيل الحساب ✅" : "تم تعطيل الحساب ❌" });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const pendingCount = users.filter((u) => !u.is_approved).length;
  const approvedCount = users.filter((u) => u.is_approved).length;

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

      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <Users className="w-5 h-5 text-yellow-400 mb-2" />
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
                    <TableHead className="text-right text-muted-foreground">المستخدم</TableHead>
                    <TableHead className="text-right text-muted-foreground">تاريخ التسجيل</TableHead>
                    <TableHead className="text-right text-muted-foreground">الحالة</TableHead>
                    <TableHead className="text-right text-muted-foreground w-32">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className="border-border/30 hover:bg-secondary/30">
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                          {user.id.slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell>
                        {user.is_approved ? (
                          <Badge className="bg-success/20 text-success border-success/30 text-[10px] hover:bg-success/20">مفعّل</Badge>
                        ) : (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] hover:bg-yellow-500/20">معلّق</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {updating === user.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : user.is_approved ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleApproval(user.id, false)}
                            className="text-destructive hover:text-destructive text-xs h-8"
                          >
                            <XCircle className="w-3.5 h-3.5 ml-1" />
                            تعطيل
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleApproval(user.id, true)}
                            className="text-success hover:text-success text-xs h-8"
                          >
                            <CheckCircle className="w-3.5 h-3.5 ml-1" />
                            تفعيل
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 md:hidden">
              {users.map((user) => (
                <div key={user.id} className="glass-card p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground mb-1" dir="ltr">
                      {user.id.slice(0, 8)}...
                    </p>
                    <div className="flex items-center gap-2">
                      {user.is_approved ? (
                        <Badge className="bg-success/20 text-success border-success/30 text-[10px] hover:bg-success/20">مفعّل</Badge>
                      ) : (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] hover:bg-yellow-500/20">معلّق</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                  </div>
                  {updating === user.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : user.is_approved ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleApproval(user.id, false)}
                      className="text-destructive hover:text-destructive text-xs h-8"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleApproval(user.id, true)}
                      className="text-success hover:text-success text-xs h-8"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
