import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, UserPlus, LogIn, Eye, EyeOff } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

const Auth = () => {
  const { t, dir } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: t("auth.loginSuccess") });
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: t("auth.signupSuccess") });
      }
    } catch (error: any) {
      toast({ title: t("auth.error"), description: error.message, variant: "destructive" });
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
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl animate-float" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl animate-float" style={{ animationDelay: "3s" }} />
      </div>
      <div className="glass-card p-8 w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-telegram mb-4 glow-primary">
            <Send className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("auth.title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {isLogin ? t("auth.loginSubtitle") : t("auth.signupSubtitle")}
          </p>
        </div>
        <form onSubmit={handleAuth} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground/80">{t("auth.email")}</Label>
            <Input id="email" type="email" placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr"
              className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 text-left" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground/80">{t("auth.password")}</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" minLength={6}
                className="bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 text-left pl-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full gradient-telegram text-primary-foreground font-semibold h-11 glow-primary hover:opacity-90 transition-opacity">
            {loading ? <span className="animate-spin">⏳</span> : isLogin ? (
              <><LogIn className="w-4 h-4 ml-2" />{t("auth.login")}</>
            ) : (
              <><UserPlus className="w-4 h-4 ml-2" />{t("auth.signup")}</>
            )}
          </Button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-muted-foreground hover:text-primary transition-colors">
            {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
