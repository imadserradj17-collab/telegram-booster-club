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
  const [isModerator, setIsModerator] = useState(false);
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
          setIsModerator(false);
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
    const [profileRes, tokenRes, adminRes, modRes] = await Promise.all([
      supabase.from("profiles").select("is_approved, approved_until").eq("id", userId).maybeSingle(),
      supabase.from("bot_tokens").select("id").eq("user_id", userId).maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "moderator" as any }),
    ]);

    const profile = profileRes.data;
    const approved = profile?.is_approved &&
      (!profile.approved_until || new Date(profile.approved_until) > new Date());
    setIsApproved(approved ?? false);
    setHasBotToken(!!tokenRes.data);
    const adminFlag = adminRes.data === true;
    const modFlag = modRes.data === true;
    setIsAdmin(adminFlag);
    setIsModerator(modFlag);
    setShowAdmin(adminFlag || modFlag);
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

  const canStaff = isAdmin || isModerator;

  if (canStaff && showAdmin) {
    return <AdminPanel role={isAdmin ? "admin" : "moderator"} onGoToDashboard={() => setShowAdmin(false)} />;
  }

  if (!isApproved && !canStaff) return <PendingApproval />;
  if (!hasBotToken) return <BotTokenSetup onComplete={() => setHasBotToken(true)} />;

  return <Dashboard onShowAdmin={canStaff ? () => setShowAdmin(true) : undefined} />;
};

export default Index;
