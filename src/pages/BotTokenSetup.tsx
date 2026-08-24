import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Bot, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

interface BotTokenSetupProps {
  onComplete: () => void;
}

const BotTokenSetup = ({ onComplete }: BotTokenSetupProps) => {
  const { t, dir } = useLanguage();
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
      if (!user) throw new Error(t("bot.notLoggedIn"));
      const { error } = await supabase.from("bot_tokens").upsert(
        { user_id: user.id, token: token.trim(), token_updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      const { data: webhookRes, error: webhookErr } = await invokeFunction("telegram-bot", {
        body: { action: "setup_webhook", bot_token: token.trim(), owner_id: user.id },
      });
      if (webhookErr) throw webhookErr;
      if (!webhookRes?.ok) throw new Error(webhookRes?.description || t("bot.webhookFailed"));
      setStep("done");
      toast({ title: t("bot.success") });
      setTimeout(() => onComplete(), 1500);
    } catch (error: any) {
      setStep("input");
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir={dir}>
      <div className="absolute top-4 left-4 z-20">
        <LanguageSwitcher />
      </div>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl animate-float" />
      </div>
      <div className="glass-card p-8 w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-telegram mb-4 glow-primary">
            {step === "done" ? <CheckCircle className="w-8 h-8 text-primary-foreground" /> : <Bot className="w-8 h-8 text-primary-foreground" />}
          </div>
          <h2 className="text-2xl font-bold text-foreground">{step === "done" ? t("bot.done") : t("bot.title")}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {step === "activating" ? t("bot.activating") : step === "done" ? t("bot.ready") : t("bot.desc")}
          </p>
        </div>
        {step === "activating" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t("bot.activatingStatus")}</p>
          </div>
        )}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle className="w-12 h-12 text-success" />
            <p className="text-sm text-foreground">{t("bot.redirecting")}</p>
          </div>
        )}
        {step === "input" && (
          <>
            <div className="glass-card p-4 mb-6 border-primary/20">
              <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                <Send className="w-4 h-4" />{t("bot.howToGet")}
              </h3>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>{t("bot.step1")}</li>
                <li>{t("bot.step2")}</li>
                <li>{t("bot.step3")}</li>
                <li>{t("bot.step4")}</li>
              </ol>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="token" className="text-foreground/80">{t("bot.tokenLabel")}</Label>
                <Input id="token" type="text" placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyz" value={token} onChange={(e) => setToken(e.target.value)} required dir="ltr"
                  className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 text-left font-mono text-sm" />
              </div>
              <Button type="submit" disabled={loading || !token.trim()} className="w-full gradient-telegram text-primary-foreground font-semibold h-11 glow-primary hover:opacity-90 transition-opacity">
                <ArrowLeft className="w-4 h-4 ml-2" />{t("bot.activate")}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default BotTokenSetup;
