import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { Activity, Search, UserPlus, UserX, Tv, Shield, Crown, Ban, CheckCircle2 } from "lucide-react";

interface LogRow {
  id: string;
  created_at: string;
  actor_telegram_id: number;
  actor_role: string;
  actor_name: string | null;
  actor_username: string | null;
  action: string;
  target_label: string | null;
  target_telegram_id: number | null;
  details: Record<string, any>;
}

const actionMeta: Record<string, { icon: any; color: string; ar: string; en: string }> = {
  subscriber_added: { icon: UserPlus, color: "text-green-500", ar: "إضافة/تجديد مشترك", en: "Subscriber added/renewed" },
  subscriber_deleted: { icon: UserX, color: "text-red-500", ar: "حذف مشترك", en: "Subscriber deleted" },
  channel_deleted: { icon: Tv, color: "text-orange-500", ar: "حذف قناة", en: "Channel deleted" },
  user_banned: { icon: Ban, color: "text-red-500", ar: "حظر مستخدم", en: "User banned" },
  user_unbanned: { icon: CheckCircle2, color: "text-green-500", ar: "إلغاء حظر مستخدم", en: "User unbanned" },
};

export function BotActivityLogView({ botTokenId }: { botTokenId: string }) {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    const { data } = await supabase
      .from("bot_admin_activity_log")
      .select("*")
      .eq("bot_token_id", botTokenId)
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data || []) as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    const channel = supabase
      .channel(`bot_activity_${botTokenId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_admin_activity_log", filter: `bot_token_id=eq.${botTokenId}` },
        (payload) => setRows((prev) => [payload.new as LogRow, ...prev].slice(0, 300)),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [botTokenId]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.actor_telegram_id.toString().includes(q) ||
      (r.actor_name || "").toLowerCase().includes(q) ||
      (r.target_label || "").toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q)
    );
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">
            {lang === "ar" ? "سجل أعمال الإدارة" : "Admin Activity Log"}
          </h2>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === "ar" ? "بحث (اسم، معرف، إجراء)..." : "Search (name, id, action)..."}
            className="ps-8"
          />
        </div>
      </div>

      <ScrollArea className="h-[600px] pr-2">
        {loading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {lang === "ar" ? "جارٍ التحميل..." : "Loading..."}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {lang === "ar" ? "لا توجد سجلات بعد." : "No activity yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => {
              const meta = actionMeta[r.action] || { icon: Activity, color: "text-muted-foreground", ar: r.action, en: r.action };
              const Icon = meta.icon;
              const isMod = r.actor_role === "moderator";
              return (
                <li key={r.id} className="flex gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition">
                  <div className={`mt-0.5 ${meta.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{lang === "ar" ? meta.ar : meta.en}</span>
                      {r.target_label && (
                        <Badge variant="outline" className="font-mono text-xs">{r.target_label}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Badge variant={isMod ? "secondary" : "default"} className="gap-1">
                        {isMod ? <Shield className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
                        {isMod
                          ? (lang === "ar" ? "مشرف" : "Moderator")
                          : (lang === "ar" ? "المالك" : "Owner")}
                      </Badge>
                      <span className="font-mono">{r.actor_telegram_id}</span>
                      {r.actor_username && <span>@{r.actor_username}</span>}
                      <span>•</span>
                      <span>{fmt(r.created_at)}</span>
                    </div>
                    {r.details && Object.keys(r.details).length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground/80">
                        {r.action === "subscriber_added" && (
                          <span>
                            {r.details.is_permanent
                              ? (lang === "ar" ? "♾ اشتراك دائم" : "♾ Permanent")
                              : `📅 ${r.details.days} ${lang === "ar" ? "يوم" : "days"}`}
                            {" • "}
                            📺 {r.details.channels_count} {lang === "ar" ? "قناة" : "channels"}
                          </span>
                        )}
                        {r.action === "subscriber_deleted" && (
                          <span>👢 {r.details.kicked_channels} {lang === "ar" ? "قناة طُرد منها" : "channels kicked"}</span>
                        )}
                        {r.action === "user_banned" && (
                          <span>
                            🚫 {r.details.channels_banned} {lang === "ar" ? "قناة" : "channels"}
                            {r.details.reason ? ` • 📝 ${r.details.reason}` : ""}
                          </span>
                        )}
                        {r.action === "user_unbanned" && (
                          <span>✅ {r.details.channels_unbanned} {lang === "ar" ? "قناة" : "channels"}</span>
                        )}

                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </Card>
  );
}
