import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Network, ChevronDown, ChevronLeft, Search, ShieldAlert, ShieldCheck, Ban, Save, RefreshCw } from "lucide-react";

interface Ref {
  id: string;
  referrer_telegram_id: number;
  referred_telegram_id: number;
  referred_name: string | null;
  referred_username: string | null;
  status: string;
  created_at: string;
}

const PENDING_HOURS = 12;
const MAX_DEPTH = 3;

export function ReferralTreeView({ botTokenId, ownerId }: { botTokenId: string; ownerId: string }) {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { toast } = useToast();
  const [refs, setRefs] = useState<Ref[]>([]);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [blocked, setBlocked] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const load = async () => {
    const [r, b, u, s] = await Promise.all([
      supabase.from("bot_referrals").select("*").eq("bot_token_id", botTokenId).order("created_at", { ascending: true }).limit(5000),
      supabase.from("bot_referral_blocks").select("telegram_user_id").eq("bot_token_id", botTokenId),
      supabase.from("bot_users").select("telegram_user_id, first_name, last_name, telegram_username").eq("bot_token_id", botTokenId).limit(10000),
      supabase.from("bot_tokens").select("referral_daily_limit").eq("id", botTokenId).maybeSingle(),
    ]);
    setRefs((r.data || []) as Ref[]);
    setBlocked(new Set((b.data || []).map((x: any) => Number(x.telegram_user_id))));
    const m = new Map<number, string>();
    for (const x of (u.data || []) as any[]) {
      m.set(Number(x.telegram_user_id), [x.first_name, x.last_name].filter(Boolean).join(" ") || (x.telegram_username ? `@${x.telegram_username}` : String(x.telegram_user_id)));
    }
    setNames(m);
    setLimit((s.data as any)?.referral_daily_limit ?? 20);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    const j = setInterval(load, 60000);
    return () => { clearInterval(i); clearInterval(j); };
  }, [botTokenId]);

  const children = useMemo(() => {
    const map = new Map<number, Ref[]>();
    for (const r of refs) {
      const k = Number(r.referrer_telegram_id);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }, [refs]);

  const referredSet = useMemo(() => new Set(refs.map((r) => Number(r.referred_telegram_id))), [refs]);
  const roots = useMemo(() => [...children.keys()].filter((id) => !referredSet.has(id)), [children, referredSet]);

  const countLevel = (id: number, depth: number): number => {
    let frontier = [id];
    for (let d = 0; d < depth; d++) {
      frontier = frontier.flatMap((f) => (children.get(f) || []).filter((r) => r.status !== "revoked").map((r) => Number(r.referred_telegram_id)));
    }
    return frontier.length;
  };

  const suspicion = (id: number): string | null => {
    const list = children.get(id) || [];
    if (list.length >= 4) {
      const rev = list.filter((r) => r.status === "revoked").length;
      if (rev / list.length >= 0.5) return ar ? `${rev}/${list.length} دعوات ملغاة` : `${rev}/${list.length} revoked`;
    }
    const times = list.map((r) => new Date(r.created_at).getTime()).sort((a, b) => a - b);
    for (let i = 0; i + 9 < times.length; i++) {
      if (times[i + 9] - times[i] < 3600000) return ar ? "10+ دعوات خلال ساعة" : "10+ invites within 1h";
    }
    return null;
  };

  const timeLeft = (iso: string) => {
    const ms = new Date(iso).getTime() + PENDING_HOURS * 3600000 - Date.now();
    if (ms <= 0) return ar ? "انتهت المهلة" : "Expired";
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return ar ? `${h}س ${m}د` : `${h}h ${m}m`;
  };

  const statusBadge = (r: Ref) =>
    r.status === "valid" ? <Badge className="bg-primary/15 text-primary hover:bg-primary/15">{ar ? "✅ انضم" : "✅ Joined"}</Badge>
    : r.status === "revoked" ? <Badge variant="destructive">{ar ? "❌ ملغاة" : "❌ Revoked"}</Badge>
    : <Badge variant="secondary">⏳ {timeLeft(r.created_at)}</Badge>;

  const toggleBlock = async (id: number) => {
    const isB = blocked.has(id);
    const { error } = isB
      ? await supabase.from("bot_referral_blocks").delete().eq("bot_token_id", botTokenId).eq("telegram_user_id", id)
      : await supabase.from("bot_referral_blocks").insert({ bot_token_id: botTokenId, owner_id: ownerId, telegram_user_id: id, reason: suspicion(id) } as any);
    if (error) return toast({ title: ar ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    toast({ title: isB ? (ar ? "تم رفع الحظر عن الإحالات" : "Unblocked") : (ar ? "تم حظره من نظام الإحالات" : "Blocked from referrals") });
    load();
  };

  const saveLimit = async () => {
    const { error } = await supabase.from("bot_tokens").update({ referral_daily_limit: limit } as any).eq("id", botTokenId);
    if (error) return toast({ title: ar ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    toast({ title: ar ? "تم حفظ الحد اليومي ✅" : "Daily limit saved ✅" });
  };

  const name = (id: number, r?: Ref) => r?.referred_name || names.get(id) || String(id);

  const Node = ({ id, depth, r, path }: { id: number; depth: number; r?: Ref; path: string }) => {
    const kids = depth < MAX_DEPTH ? children.get(id) || [] : [];
    const isOpen = open.has(path);
    const sus = suspicion(id);
    return (
      <div className={depth > 0 ? "ms-4 border-s border-border ps-3" : ""}>
        <div className="flex flex-wrap items-center gap-2 py-1.5">
          {kids.length > 0 ? (
            <button onClick={() => setOpen((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; })} className="text-muted-foreground">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />}
            </button>
          ) : <span className="w-4" />}
          {depth > 0 && <Badge variant="outline" className="text-[10px]">{ar ? `م${depth}` : `L${depth}`}</Badge>}
          <span className="text-sm font-medium">{name(id, r)}</span>
          {r?.referred_username && <span className="text-xs text-muted-foreground">@{r.referred_username}</span>}
          <span className="text-xs font-mono text-muted-foreground">{id}</span>
          {r && statusBadge(r)}
          {depth === 0 && (
            <span className="text-xs text-muted-foreground">
              {[1, 2, 3].map((l) => `${ar ? "م" : "L"}${l}: ${countLevel(id, l)}`).join(" • ")}
            </span>
          )}
          {sus && <Badge variant="destructive" className="gap-1"><ShieldAlert className="w-3 h-3" />{sus}</Badge>}
          {blocked.has(id) && <Badge variant="destructive" className="gap-1"><Ban className="w-3 h-3" />{ar ? "محظور" : "Blocked"}</Badge>}
          {children.has(id) && (
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => toggleBlock(id)}>
              {blocked.has(id) ? <ShieldCheck className="w-3 h-3 me-1" /> : <Ban className="w-3 h-3 me-1" />}
              {blocked.has(id) ? (ar ? "رفع الحظر" : "Unblock") : (ar ? "حظر الإحالات" : "Block")}
            </Button>
          )}
        </div>
        {isOpen && kids.map((k) => (
          <Node key={k.id} id={Number(k.referred_telegram_id)} depth={depth + 1} r={k} path={`${path}/${k.id}`} />
        ))}
      </div>
    );
  };

  const q = search.trim().toLowerCase();
  const visibleRoots = roots.filter((id) => !q || name(id).toLowerCase().includes(q) || String(id).includes(q));
  const total = refs.length;
  const pending = refs.filter((r) => r.status === "pending").length;
  const revoked = refs.filter((r) => r.status === "revoked").length;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{ar ? "شجرة الإحالات" : "Referral Tree"}</h2>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ar ? "بحث بالاسم أو المعرف..." : "Search name or id..."} className="ps-8" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary/40 p-2"><div className="text-lg font-bold">{total}</div><div className="text-xs text-muted-foreground">{ar ? "كل الدعوات" : "Total"}</div></div>
        <div className="rounded-lg bg-secondary/40 p-2"><div className="text-lg font-bold">{pending}</div><div className="text-xs text-muted-foreground">{ar ? "بانتظار الانضمام" : "Pending"}</div></div>
        <div className="rounded-lg bg-secondary/40 p-2"><div className="text-lg font-bold">{revoked}</div><div className="text-xs text-muted-foreground">{ar ? "ملغاة" : "Revoked"}</div></div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="w-4 h-4 text-primary" />{ar ? "نظام الحماية" : "Protection"}</div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc ps-5">
          <li>{ar ? "من دخل البوت سابقاً أو كان مشتركاً أو عضواً بقناة لا يُحتسب، وكل شخص يُحتسب مرة واحدة فقط" : "Anyone seen before never counts; each person counts once"}</li>
          <li>{ar ? "لا يمكن دعوة النفس ولا تُحتسب حسابات البوتات" : "No self-invites, bots ignored"}</li>
          <li>{ar ? "تُلغى الدعوة إذا لم ينضم المدعو لقناة خلال 12 ساعة" : "Invite revoked if no channel joined within 12h"}</li>
          <li>{ar ? "يتم تمييز الحسابات المشبوهة تلقائياً ويمكنك حظرها من الإحالات" : "Suspicious accounts are flagged; you can block them"}</li>
        </ul>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs">{ar ? "الحد الأقصى للدعوات لكل شخص يومياً (0 = بلا حد):" : "Max invites per person per day (0 = no limit):"}</span>
          <Input type="number" min={0} max={1000} value={limit} onChange={(e) => setLimit(Math.max(0, parseInt(e.target.value) || 0))} className="w-20 h-8 text-sm" />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={saveLimit}><Save className="w-3 h-3 me-1" />{ar ? "حفظ" : "Save"}</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">{ar ? "جارٍ التحميل..." : "Loading..."}</p>
      ) : visibleRoots.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">{ar ? "لا توجد إحالات بعد." : "No referrals yet."}</p>
      ) : (
        <div className="space-y-1">
          {visibleRoots.map((id) => <Node key={id} id={id} depth={0} path={String(id)} />)}
        </div>
      )}
    </Card>
  );
}
