import { supabase } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

const PendingApproval = () => {
  const { t, dir } = useLanguage();
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir={dir}>
      <div className="absolute top-4 left-4 z-20">
        <LanguageSwitcher />
      </div>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl animate-float" />
      </div>
      <div className="glass-card p-8 w-full max-w-md relative z-10 animate-fade-in text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-500/20 mb-4">
          <Clock className="w-8 h-8 text-yellow-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t("pending.title")}</h2>
        <p className="text-muted-foreground text-sm mb-6">{t("pending.desc")}</p>
        <Button variant="ghost" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
          <LogOut className="w-4 h-4 ml-2" />{t("common.logout")}
        </Button>
      </div>
    </div>
  );
};

export default PendingApproval;
