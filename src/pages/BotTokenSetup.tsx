import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Bot, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";

interface BotTokenSetupProps {
  onComplete: () => void;
}

const BotTokenSetup = ({ onComplete }: BotTokenSetupProps) => {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"input" | "activating" | "done">("input");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setStep("activating");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("غير مسجل الدخول");

      // Save token
      const { error } = await supabase.from("bot_tokens").insert({
        user_id: user.id,
        token: token.trim(),
      });
      if (error) throw error;

      // Setup webhook
      const { data: webhookRes, error: webhookErr } = await supabase.functions.invoke("telegram-bot", {
        body: {
          action: "setup_webhook",
          bot_token: token.trim(),
          owner_id: user.id,
        },
      });

      if (webhookErr) throw webhookErr;
      if (!webhookRes?.ok) {
        throw new Error(webhookRes?.description || "فشل تفعيل الويب هوك");
      }

      setStep("done");
      toast({ title: "تم تفعيل البوت بنجاح! 🤖✅" });
      setTimeout(() => onComplete(), 1500);
    } catch (error: any) {
      setStep("input");
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
            {step === "done" ? (
              <CheckCircle className="w-8 h-8 text-primary-foreground" />
            ) : (
              <Bot className="w-8 h-8 text-primary-foreground" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            {step === "done" ? "تم التفعيل! 🎉" : "إعداد بوت تلغرام"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {step === "activating"
              ? "جاري تفعيل البوت وربط الويب هوك..."
              : step === "done"
              ? "البوت جاهز للعمل"
              : "أدخل توكن البوت الخاص بك للبدء في إدارة الاشتراكات"}
          </p>
        </div>

        {step === "activating" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">جاري التفعيل...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle className="w-12 h-12 text-success" />
            <p className="text-sm text-foreground">سيتم نقلك للوحة التحكم...</p>
          </div>
        )}

        {step === "input" && (
          <>
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
                <ArrowLeft className="w-4 h-4 ml-2" />
                تفعيل البوت
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default BotTokenSetup;
