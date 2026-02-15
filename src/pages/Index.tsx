import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import Auth from "@/pages/Auth";
import BotTokenSetup from "@/pages/BotTokenSetup";
import Dashboard from "@/pages/Dashboard";
import { RefreshCw } from "lucide-react";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [hasBotToken, setHasBotToken] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) {
          checkBotToken(session.user.id);
        } else {
          setHasBotToken(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkBotToken(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkBotToken = async (userId: string) => {
    const { data } = await supabase
      .from("bot_tokens")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    setHasBotToken(!!data);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!session) return <Auth />;
  if (!hasBotToken) return <BotTokenSetup onComplete={() => setHasBotToken(true)} />;
  return <Dashboard />;
};

export default Index;
