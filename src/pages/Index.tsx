import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import Auth from "@/pages/Auth";
import BotTokenSetup from "@/pages/BotTokenSetup";
import Dashboard from "@/pages/Dashboard";
import PendingApproval from "@/pages/PendingApproval";
import AdminPanel from "@/pages/AdminPanel";
import { RefreshCw } from "lucide-react";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [hasBotToken, setHasBotToken] = useState<boolean | null>(null);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) {
          checkUserStatus(session.user.id);
        } else {
          setHasBotToken(null);
          setIsApproved(null);
          setIsAdmin(false);
          setShowAdmin(false);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkUserStatus(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserStatus = async (userId: string) => {
    const [profileRes, tokenRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("is_approved").eq("id", userId).maybeSingle(),
      supabase.from("bot_tokens").select("id").eq("user_id", userId).maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);

    setIsApproved(profileRes.data?.is_approved ?? false);
    setHasBotToken(!!tokenRes.data);
    setIsAdmin(roleRes.data === true);
    setShowAdmin(roleRes.data === true);
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
  
  // Admin can switch between admin panel and dashboard
  if (isAdmin && showAdmin) {
    return <AdminPanel onGoToDashboard={() => setShowAdmin(false)} />;
  }

  if (!isApproved) return <PendingApproval />;
  if (!hasBotToken) return <BotTokenSetup onComplete={() => setHasBotToken(true)} />;
  
  return <Dashboard onShowAdmin={isAdmin ? () => setShowAdmin(true) : undefined} />;
};

export default Index;
