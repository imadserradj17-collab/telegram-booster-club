import { useLanguage } from "@/contexts/LanguageContext";
import { Globe } from "lucide-react";

const LanguageSwitcher = ({ className = "" }: { className?: string }) => {
  const { lang, setLang } = useLanguage();

  return (
    <button
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors ${className}`}
      title={lang === "ar" ? "Switch to English" : "التبديل للعربية"}
    >
      <Globe className="w-4 h-4" />
      <span>{lang === "ar" ? "EN" : "عربي"}</span>
    </button>
  );
};

export default LanguageSwitcher;
