import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Tv, Search, Image as ImageIcon, Video, FileText,
  Music, Mic, Film, Sticker, Loader2, Download, Play, RefreshCw,
} from "lucide-react";

interface Channel {
  id: string;
  channel_name: string;
  channel_type: string;
}

interface ChannelMessage {
  id: string;
  channel_id: string;
  telegram_message_id: number;
  message_text: string | null;
  media_type: string | null;
  media_file_id: string | null;
  media_thumbnail: string | null;
  media_caption: string | null;
  media_mime_type: string | null;
  media_file_size: number | null;
  media_duration: number | null;
  media_width: number | null;
  media_height: number | null;
  sender_name: string | null;
  message_date: string;
}

const PAGE_SIZE = 30;

export default function ChannelMessagesView({ channels }: { channels: Channel[] }) {
  const { lang, dir } = useLanguage();
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [filterChannelId, setFilterChannelId] = useState<string>("__all__");
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [totalCount, setTotalCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const channelMap = channels.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {} as Record<string, Channel>);

  const loadMessages = useCallback(
    async (offset = 0, append = false) => {
      setLoading(true);
      let query = supabase
        .from("channel_messages")
        .select("*", { count: "exact" })
        .order("message_date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (filterChannelId !== "__all__") {
        query = query.eq("channel_id", filterChannelId);
      }
      if (search.trim()) {
        query = query.or(
          `message_text.ilike.%${search}%,media_caption.ilike.%${search}%`,
        );
      }
      const { data, count } = await query;
      const rows = (data as ChannelMessage[]) || [];
      setHasMore(rows.length === PAGE_SIZE);
      setMessages((prev) => (append ? [...prev, ...rows] : rows));
      if (typeof count === "number") setTotalCount(count);
      setLoading(false);
    },
    [filterChannelId, search],
  );

  // Silent fetch of latest messages (used by auto-refresh fallback)
  const fetchLatestSilently = useCallback(async () => {
    let query = supabase
      .from("channel_messages")
      .select("*", { count: "exact" })
      .order("message_date", { ascending: false })
      .limit(PAGE_SIZE);
    if (filterChannelId !== "__all__") {
      query = query.eq("channel_id", filterChannelId);
    }
    if (search.trim()) {
      query = query.or(
        `message_text.ilike.%${search}%,media_caption.ilike.%${search}%`,
      );
    }
    const { data, count } = await query;
    const rows = (data as ChannelMessage[]) || [];
    if (typeof count === "number") setTotalCount(count);
    setMessages((prev) => {
      // Merge: keep older loaded ones, prepend any new ones
      const existingIds = new Set(prev.map((m) => m.id));
      const fresh = rows.filter((r) => !existingIds.has(r.id));
      if (fresh.length === 0) {
        // Update existing rows in place (in case of edits)
        return prev.map((p) => rows.find((r) => r.id === p.id) || p);
      }
      // Merge fresh rows + previous, then re-sort by date desc, dedupe
      const merged = [...fresh, ...prev];
      const seen = new Set<string>();
      return merged
        .filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        })
        .sort((a, b) => b.message_date.localeCompare(a.message_date));
    });
  }, [filterChannelId, search]);

  // Reload on filter/search change
  useEffect(() => {
    setMessages([]);
    setMediaUrls({});
    loadMessages(0, false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filterChannelId, loadMessages]);

  // ─── REALTIME: subscribe to new channel_messages ───
  useEffect(() => {
    const channel = supabase
      .channel("channel_messages_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channel_messages" },
        (payload) => {
          const newMsg = payload.new as ChannelMessage;
          // Filter by selected channel if not "all"
          if (filterChannelId !== "__all__" && newMsg.channel_id !== filterChannelId) return;
          // Filter by search if active
          if (search.trim()) {
            const q = search.toLowerCase();
            const text = (newMsg.message_text || "").toLowerCase();
            const cap = (newMsg.media_caption || "").toLowerCase();
            if (!text.includes(q) && !cap.includes(q)) return;
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [newMsg, ...prev];
          });
          setTotalCount((c) => c + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "channel_messages" },
        (payload) => {
          const upd = payload.new as ChannelMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === upd.id ? { ...m, ...upd } : m)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "channel_messages" },
        (payload) => {
          const del = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== del.id));
          setTotalCount((c) => Math.max(0, c - 1));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterChannelId, search]);

  // ─── AUTO-REFRESH FALLBACK: poll every 10s ───
  useEffect(() => {
    const interval = setInterval(() => {
      // Skip if tab hidden to save resources
      if (typeof document !== "undefined" && document.hidden) return;
      fetchLatestSilently();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchLatestSilently]);

  // Refresh immediately when tab regains focus
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) fetchLatestSilently();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchLatestSilently]);

  // Load media thumbnails for visible messages
  useEffect(() => {
    if (!messages.length) return;
    const needLoad = messages.filter(
      (m) =>
        m.media_file_id &&
        !mediaUrls[m.id] &&
        ["photo", "video", "animation", "sticker"].includes(m.media_type || ""),
    );
    needLoad.slice(0, 15).forEach(async (m) => {
      const fileToFetch = m.media_thumbnail || m.media_file_id;
      if (!fileToFetch) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-channel-file?file_id=${encodeURIComponent(fileToFetch)}&message_id=${m.id}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setMediaUrls((prev) => ({ ...prev, [m.id]: objUrl }));
      } catch { /* ignore */ }
    });
  }, [messages, mediaUrls]);

  const downloadFullMedia = async (m: ChannelMessage) => {
    if (!m.media_file_id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-channel-file?file_id=${encodeURIComponent(m.media_file_id)}&message_id=${m.id}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${m.media_type || "file"}_${m.telegram_message_id}`;
      a.click();
    } catch { /* ignore */ }
  };

  const formatSize = (b?: number | null) => {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDuration = (s?: number | null) => {
    if (!s) return "";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const mediaIcon = (type: string | null) => {
    switch (type) {
      case "photo": return <ImageIcon className="h-4 w-4" />;
      case "video": return <Video className="h-4 w-4" />;
      case "document": return <FileText className="h-4 w-4" />;
      case "audio": return <Music className="h-4 w-4" />;
      case "voice": return <Mic className="h-4 w-4" />;
      case "animation": return <Film className="h-4 w-4" />;
      case "sticker": return <Sticker className="h-4 w-4" />;
      default: return null;
    }
  };

  const channelInitials = (name: string) =>
    name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  // Group messages by day for date separators
  const formatDayLabel = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yest = new Date(today.getTime() - 86400000);
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dDay.getTime() === today.getTime()) return lang === "ar" ? "اليوم" : "Today";
    if (dDay.getTime() === yest.getTime()) return lang === "ar" ? "الأمس" : "Yesterday";
    return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
      day: "numeric", month: "long", year: "numeric",
    });
  };

  return (
    <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden h-[calc(100vh-12rem)]">
      {/* ─── HEADER (filter + search) ─── */}
      <div className="border-b border-border bg-card/60 backdrop-blur-sm p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground flex-shrink-0">
            <Tv className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              {lang === "ar" ? "📥 سجل الرسائل" : "📥 Messages feed"}
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
                LIVE
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {totalCount} {lang === "ar" ? "رسالة" : "messages"}
              {filterChannelId !== "__all__" && channelMap[filterChannelId] && (
                <> • {channelMap[filterChannelId].channel_name}</>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadMessages(0, false)}
            disabled={loading}
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
            <Input
              placeholder={lang === "ar" ? "بحث في الرسائل..." : "Search messages..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") loadMessages(0, false); }}
              className={dir === "rtl" ? "pr-9" : "pl-9"}
            />
          </div>
          <select
            value={filterChannelId}
            onChange={(e) => setFilterChannelId(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground max-w-[180px]"
          >
            <option value="__all__">{lang === "ar" ? "كل القنوات" : "All channels"}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.channel_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── MESSAGES FEED ─── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/30">
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            <Tv className="h-12 w-12 mx-auto mb-3 opacity-30" />
            {lang === "ar" ? "لا توجد رسائل بعد" : "No messages yet"}
          </div>
        ) : (
          <>
            {messages.map((m, idx) => {
              const ch = channelMap[m.channel_id];
              const prev = messages[idx - 1];
              const showDayDivider =
                !prev || formatDayLabel(prev.message_date) !== formatDayLabel(m.message_date);

              return (
                <div key={m.id}>
                  {showDayDivider && (
                    <div className="flex items-center justify-center my-3">
                      <span className="text-[11px] text-muted-foreground bg-secondary/40 px-3 py-1 rounded-full">
                        {formatDayLabel(m.message_date)}
                      </span>
                    </div>
                  )}

                  <article className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    {/* Channel header strip (like Telegram channel name) */}
                    <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-secondary/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground text-[10px] font-semibold flex-shrink-0">
                          {ch ? channelInitials(ch.channel_name) : <Tv className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">
                            {ch?.channel_name || (lang === "ar" ? "قناة محذوفة" : "Deleted channel")}
                          </div>
                          {m.sender_name && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {m.sender_name}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        {new Date(m.message_date).toLocaleTimeString(
                          lang === "ar" ? "ar-EG" : "en-US",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                    </header>

                    {/* Media */}
                    {m.media_type && ["photo", "video", "animation", "sticker"].includes(m.media_type) && (
                      <div className="relative bg-secondary/20 flex items-center justify-center">
                        {mediaUrls[m.id] ? (
                          m.media_type === "video" || m.media_type === "animation" ? (
                            <div className="relative w-full">
                              <img
                                src={mediaUrls[m.id]}
                                alt=""
                                className="w-full max-h-[420px] object-cover cursor-pointer"
                                onClick={() => downloadFullMedia(m)}
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="bg-black/60 rounded-full p-3">
                                  <Play className="h-6 w-6 text-white" fill="white" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={mediaUrls[m.id]}
                              alt=""
                              className="w-full max-h-[420px] object-contain cursor-pointer"
                              onClick={() => downloadFullMedia(m)}
                            />
                          )
                        ) : (
                          <div className="w-full h-40 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    )}

                    {m.media_type && ["document", "audio", "voice", "video_note"].includes(m.media_type) && (
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/30"
                        onClick={() => downloadFullMedia(m)}
                      >
                        <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                          {mediaIcon(m.media_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {m.media_type === "voice" ? (lang === "ar" ? "رسالة صوتية" : "Voice message")
                              : m.media_type === "audio" ? (lang === "ar" ? "ملف صوتي" : "Audio")
                              : m.media_type === "video_note" ? (lang === "ar" ? "فيديو دائري" : "Video note")
                              : (lang === "ar" ? "ملف" : "Document")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[formatSize(m.media_file_size), formatDuration(m.media_duration), m.media_mime_type]
                              .filter(Boolean).join(" • ")}
                          </div>
                        </div>
                        <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    )}

                    {/* Text */}
                    {(m.message_text || m.media_caption) && (
                      <div className="px-3 py-2.5">
                        <div className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                          {m.message_text || m.media_caption}
                        </div>
                      </div>
                    )}
                  </article>
                </div>
              );
            })}

            {hasMore && (
              <div className="text-center pt-2 pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadMessages(messages.length, true)}
                  disabled={loading}
                >
                  {loading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : (lang === "ar" ? "تحميل المزيد" : "Load more")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
