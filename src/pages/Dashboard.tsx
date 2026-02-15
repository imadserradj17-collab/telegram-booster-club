import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Send, LogOut, Plus, Trash2, RefreshCw, Users, Zap, Settings,
} from "lucide-react";

interface Subscription {
  id: string;
  channel_name: string;
  channel_id: string | null;
  status: string;
  created_at: string;
}

const Dashboard = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [newChannel, setNewChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "خطأ في جلب البيانات", variant: "destructive" });
    } else {
      setSubscriptions(data || []);
    }
    setLoading(false);
  };

  const addSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannel.trim()) return;

    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      channel_name: newChannel.trim(),
    });

    if (error) {
      toast({ title: "خطأ في الإضافة", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تمت إضافة القناة ✅" });
      setNewChannel("");
      fetchSubscriptions();
    }
    setAdding(false);
  };

  const deleteSubscription = async (id: string) => {
    const { error } = await supabase.from("subscriptions").delete().eq("id", id);
    if (error) {
      toast({ title: "خطأ في الحذف", variant: "destructive" });
    } else {
      toast({ title: "تم حذف القناة" });
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      toast({ title: "خطأ في التحديث", variant: "destructive" });
    } else {
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s))
      );
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-telegram flex items-center justify-center">
              <Send className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">إدارة الاشتراكات</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-4 h-4 ml-2" />
            خروج
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: Users, label: "إجمالي القنوات", value: subscriptions.length },
            { icon: Zap, label: "نشطة", value: subscriptions.filter((s) => s.status === "active").length },
            { icon: Settings, label: "متوقفة", value: subscriptions.filter((s) => s.status === "paused").length },
          ].map(({ icon: Icon, label, value }, i) => (
            <div key={i} className="glass-card p-4 text-center">
              <Icon className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Add Channel */}
        <form onSubmit={addSubscription} className="glass-card p-4 mb-6 flex gap-3 items-end">
          <div className="flex-1">
            <Input
              placeholder="اسم القناة أو المعرّف..."
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button
            type="submit"
            disabled={adding || !newChannel.trim()}
            className="gradient-telegram text-primary-foreground glow-primary hover:opacity-90"
          >
            <Plus className="w-4 h-4 ml-1" />
            إضافة
          </Button>
        </form>

        {/* Channels List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              جاري التحميل...
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-12 glass-card">
              <Send className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">لا توجد قنوات بعد</p>
              <p className="text-xs text-muted-foreground/60 mt-1">أضف أول قناة تلغرام للبدء</p>
            </div>
          ) : (
            subscriptions.map((sub, i) => (
              <div
                key={sub.id}
                className="glass-card p-4 flex items-center justify-between animate-fade-in"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${sub.status === "active" ? "bg-success" : "bg-muted-foreground"}`} />
                  <div>
                    <p className="font-medium text-foreground">{sub.channel_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sub.created_at).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleStatus(sub.id, sub.status)}
                    className={sub.status === "active" ? "text-success hover:text-success/80" : "text-muted-foreground hover:text-foreground"}
                  >
                    {sub.status === "active" ? "نشط" : "متوقف"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSubscription(sub.id)}
                    className="text-muted-foreground hover:text-destructive h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
