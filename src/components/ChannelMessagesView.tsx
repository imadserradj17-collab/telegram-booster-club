import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Tv, Search, ArrowLeft, Image as ImageIcon, Video, FileText,
  Music, Mic, Film, Sticker, Loader2, Download, Play,
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

const PAGE_SIZE = 50;

export default function ChannelMessagesView({ channels }: { channels: Channel[] }) {
  const { lang, dir } = useLanguage();
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, ChannelMessage>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch counts + last message preview per channel
  const fetchChannelMeta = useCallback(async () => {
    const ids = channels.map((c) => c.id);
    if (!ids.length) return;
    const countResults: Record<string, number> = {};
    const lastResults: Record<string, ChannelMessage> = {};
    await Promise.all(
      ids.map(async (id) => {
        const [{ count }, { data: lastRow }] = await Promise.all([
          supabase
            .from("channel_messages")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", id),
          supabase
            .from("channel_messages")
            .select("*")
            .eq("channel_id", id)
            .order("message_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        countResults[id] = count || 0;
        if (lastRow) lastResults[id] = lastRow as ChannelMessage;
      }),
    );
    setCounts(countResults);
    setLastMessages(lastResults);
  }, [channels]);

  useEffect(() => { fetchChannelMeta(); }, [fetchChannelMeta]);

  const loadMessages = useCallback(
    async (channelId: string, offset = 0, append = false) => {
      setLoading(true);
      let query = supabase
        .from("channel_messages")
        .select("*")
        .order("message_date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (channelId !== "__all__") {
        query = query.eq("channel_id", channelId);
      }
      const { data } = await query;
      const rows = (data as ChannelMessage[]) || [];
      setHasMore(rows.length === PAGE_SIZE);
      setMessages((prev) => (append ? [...prev, ...rows] : rows));
      setLoading(false);
    },
    [],
  );

  const openChannel = async (ch: Channel) => {
    setSelectedChannel(ch);
    setMessages([]);
    setMediaUrls({});
    setMobileShowChat(true);
    await loadMessages(ch.id, 0, false);
  };

  // Load thumbnails for visible messages
  useEffect(() => {
    if (!messages.length) return;
    const needLoad = messages.filter(
      (m) =>
        m.media_file_id &&
        !mediaUrls[m.id] &&
        ["photo", "video", "animation", "sticker"].includes(m.media_type || ""),
    );
    needLoad.slice(0, 20).forEach(async (m) => {
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

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays < 7) {
      return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "short" });
    }
    return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "2-digit", month: "2-digit" });
  };

  const previewText = (m?: ChannelMessage) => {
    if (!m) return lang === "ar" ? "لا توجد رسائل" : "No messages";
    if (m.message_text) return m.message_text;
    if (m.media_caption) return m.media_caption;
    switch (m.media_type) {
      case "photo": return `📷 ${lang === "ar" ? "صورة" : "Photo"}`;
      case "video": return `🎬 ${lang === "ar" ? "فيديو" : "Video"}`;
      case "document": return `📎 ${lang === "ar" ? "ملف" : "Document"}`;
      case "audio": return `🎵 ${lang === "ar" ? "ملف صوتي" : "Audio"}`;
      case "voice": return `🎙️ ${lang === "ar" ? "رسالة صوتية" : "Voice"}`;
      case "animation": return `🎞️ GIF`;
      case "sticker": return `💟 ${lang === "ar" ? "ملصق" : "Sticker"}`;
      case "video_note": return `⭕ ${lang === "ar" ? "فيديو دائري" : "Video note"}`;
      default: return lang === "ar" ? "رسالة" : "Message";
    }
  };

  const filteredChannels = channels
    .filter((c) => c.channel_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const ad = lastMessages[a.id]?.message_date || "";
      const bd = lastMessages[b.id]?.message_date || "";
      return bd.localeCompare(ad);
    });

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

  return (
    <div className="flex h-[calc(100vh-12rem)] bg-card rounded-xl border border-border overflow-hidden">
      {/* ─── CHANNELS SIDEBAR ─── */}
      <aside
        className={`${mobileShowChat && selectedChannel ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-col border-${dir === "rtl" ? "l" : "r"} border-border bg-secondary/20 flex-shrink-0`}
      >
        <div className="p-3 border-b border-border bg-card/50">
          <div className="relative">
            <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
            <Input
              placeholder={lang === "ar" ? "ابحث عن قناة..." : "Search channels..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={dir === "rtl" ? "pr-9" : "pl-9"}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredChannels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm px-4">
              {lang === "ar" ? "لا توجد قنوات" : "No channels"}
            </div>
          ) : (
            filteredChannels.map((ch) => {
              const isActive = selectedChannel?.id === ch.id;
              const last = lastMessages[ch.id];
              return (
                <button
                  key={ch.id}
                  onClick={() => openChannel(ch)}
                  className={`w-full flex items-center gap-3 px-3 py-3 transition-colors text-left border-b border-border/50 ${
                    isActive ? "bg-primary/15" : "hover:bg-secondary/40"
                  }`}
                >
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 text-primary-foreground font-semibold text-sm">
                    {channelInitials(ch.channel_name) || <Tv className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-foreground truncate text-sm">
                        {ch.channel_name}
                      </span>
                      {last && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {formatTime(last.message_date)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {previewText(last)}
                      </span>
                      {(counts[ch.id] || 0) > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-medium rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center flex-shrink-0">
                          {counts[ch.id]}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ─── CHAT AREA ─── */}
      <section
        className={`${mobileShowChat && selectedChannel ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0 bg-background/30`}
      >
        {!selectedChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="h-20 w-20 rounded-full bg-primary/15 flex items-center justify-center mb-4">
              <Tv className="h-10 w-10 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground text-lg mb-1">
              {lang === "ar" ? "اختر قناة" : "Select a channel"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {lang === "ar"
                ? "اختر قناة من القائمة لعرض رسائلها المؤرشفة"
                : "Choose a channel from the list to view its archived messages"}
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 p-3 border-b border-border bg-card/60 backdrop-blur-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileShowChat(false)}
                className="h-9 w-9 md:hidden"
              >
                <ArrowLeft className={`h-5 w-5 ${dir === "rtl" ? "rotate-180" : ""}`} />
              </Button>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-semibold text-sm flex-shrink-0">
                {channelInitials(selectedChannel.channel_name) || <Tv className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate text-sm">{selectedChannel.channel_name}</h3>
                <p className="text-xs text-muted-foreground">
                  {counts[selectedChannel.id] || messages.length} {lang === "ar" ? "رسالة" : "messages"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { loadMessages(selectedChannel.id, 0, false); fetchChannelMeta(); }}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (lang === "ar" ? "تحديث" : "Refresh")}
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {loading && messages.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {lang === "ar" ? "لا توجد رسائل بعد" : "No messages yet"}
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <div key={m.id} className="flex flex-col items-start max-w-[85%] md:max-w-[70%]">
                      <div className="bg-card border border-border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm">
                        {m.media_type && ["photo", "video", "animation", "sticker"].includes(m.media_type) && (
                          <div className="relative bg-secondary/30">
                            {mediaUrls[m.id] ? (
                              m.media_type === "video" || m.media_type === "animation" ? (
                                <div className="relative">
                                  <img
                                    src={mediaUrls[m.id]}
                                    alt=""
                                    className="max-w-md max-h-96 object-cover cursor-pointer"
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
                                  className="max-w-md max-h-96 object-contain cursor-pointer"
                                  onClick={() => downloadFullMedia(m)}
                                />
                              )
                            ) : (
                              <div className="w-64 h-40 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        )}

                        {m.media_type && ["document", "audio", "voice", "video_note"].includes(m.media_type) && (
                          <div
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/30 min-w-[240px]"
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

                        {(m.message_text || m.media_caption) && (
                          <div className="px-3 py-2">
                            <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                              {m.message_text || m.media_caption}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-secondary/20">
                          <span className="text-xs text-muted-foreground truncate">
                            {m.sender_name || selectedChannel.channel_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(m.message_date).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
                              dateStyle: "short", timeStyle: "short",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {hasMore && (
                    <div className="text-center pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadMessages(selectedChannel.id, messages.length, true)}
                        disabled={loading}
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (lang === "ar" ? "تحميل المزيد" : "Load more")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
