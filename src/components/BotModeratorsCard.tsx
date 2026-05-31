import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface Moderator {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  created_at: string;
}

interface Props {
  botTokenId: string;
}

export const BotModeratorsCard = ({ botTokenId }: Props) => {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [mods, setMods] = useState<Moderator[]>([]);
  const [loading, setLoading] = useState(true);
  const [tgId, setTgId] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bot_moderators")
      .select("id, telegram_user_id, telegram_username, created_at")
      .eq("bot_token_id", botTokenId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setMods((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [botTokenId]);

  const add = async () => {
    const id = Number(tgId.trim());
    if (!id || isNaN(id)) {
      toast.error(ar ? "أدخل Telegram ID صحيح" : "Enter a valid Telegram ID");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("bot_moderators").insert({
      bot_token_id: botTokenId,
      owner_id: ownerId,
      telegram_user_id: id,
      telegram_username: username.trim() || null,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(ar ? "تمت إضافة المشرف" : "Moderator added");
    setTgId(""); setUsername("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(ar ? "حذف هذا المشرف؟" : "Remove this moderator?")) return;
    const { error } = await supabase.from("bot_moderators").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(ar ? "تم الحذف" : "Removed");
    load();
  };

  return (
    <div className="glass-card p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">
          {ar ? "مشرفو البوت" : "Bot Moderators"}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {ar
          ? "أضف مشرفين بصلاحيات محدودة (إدارة المشتركين فقط) داخل البوت على تلغرام."
          : "Add sub-admins with limited rights (subscriber management only) inside the Telegram bot."}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <div>
          <Label className="text-foreground/80">{ar ? "Telegram ID" : "Telegram ID"}</Label>
          <Input value={tgId} onChange={(e) => setTgId(e.target.value)} placeholder="123456789" inputMode="numeric" dir="ltr"
            className="bg-secondary/50 border-border/50 font-mono" />
        </div>
        <div>
          <Label className="text-foreground/80">{ar ? "اسم المستخدم (اختياري)" : "Username (optional)"}</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" dir="ltr"
            className="bg-secondary/50 border-border/50" />
        </div>
        <Button onClick={add} disabled={saving} className="gradient-telegram text-primary-foreground">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          <span className="ms-2">{ar ? "إضافة" : "Add"}</span>
        </Button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : mods.length === 0 ? (
          <p className="text-xs text-center text-muted-foreground py-3">
            {ar ? "لا يوجد مشرفون" : "No moderators yet"}
          </p>
        ) : (
          mods.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2 border border-border/40">
              <div className="text-sm">
                <div className="font-mono text-foreground">{m.telegram_user_id}</div>
                {m.telegram_username && <div className="text-xs text-muted-foreground">@{m.telegram_username}</div>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(m.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
