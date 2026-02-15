import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Bot, ArrowLeft } from "lucide-react";

interface BotTokenSetupProps {
  onComplete: () => void;
}

const BotTokenSetup = ({ onComplete }: BotTokenSetupProps) => {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("غير مسجل الدخول");

      const { error } = await supabase.from("bot_tokens").insert({
        user_id: user.id,
        token: token.trim(),
      });

      if (error) throw error;

      toast({ title: "تم حفظ التوكن بنجاح ✅" });
      onComplete();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl animate-float" />
      </div>

      <div className="glass-card p-8 w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-telegram mb-4 glow-primary">
            <Bot className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">إعداد بوت تلغرام</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            أدخل توكن البوت الخاص بك للبدء في إدارة الاشتراكات
          </p>
        </div>

        <div className="glass-card p-4 mb-6 border-primary/20">
          <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
            <Send className="w-4 h-4" />
            كيف أحصل على التوكن؟
          </h3>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>افتح تلغرام وابحث عن @BotFather</li>
            <li>أرسل الأمر /newbot</li>
            <li>اتبع التعليمات وأنشئ بوتاً جديداً</li>
            <li>انسخ التوكن الذي ستحصل عليه</li>
          </ol>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="token" className="text-foreground/80">توكن البوت</Label>
            <Input
              id="token"
              type="text"
              placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyz"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              dir="ltr"
              className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 text-left font-mono text-sm"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full gradient-telegram text-primary-foreground font-semibold h-11 glow-primary hover:opacity-90 transition-opacity"
          >
            {loading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <>
                <ArrowLeft className="w-4 h-4 ml-2" />
                حفظ والمتابعة
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default BotTokenSetup;
