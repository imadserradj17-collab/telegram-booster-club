import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const { t, lang, dir } = useLanguage();
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch message counts per channel
  useEffect(() => {
    (async () => {
      const ids = channels.map((c) => c.id);
      if (!ids.length) return;
      const result: Record<string, number> = {};
      await Promise.all(
        ids.map(async (id) => {
          const { count } = await supabase
            .from("channel_messages")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", id);
          result[id] = count || 0;
        }),
      );
      setCounts(result);
    })();
  }, [channels]);

  const loadMessages = useCallback(
    async (channelId: string, offset = 0, append = false) => {
      setLoading(true);
      const { data } = await supabase
        .from("channel_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("message_date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
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
    await loadMessages(ch.id, 0, false);
  };

  // Load media for visible messages
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
      } catch {
        /* ignore */
      }
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
    } catch {
      /* ignore */
    }
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

  const filteredChannels = channels.filter((c) =>
    c.channel_name.toLowerCase().includes(search.toLowerCase())
  );

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

  // ─── Channel selected: show messages ───
  if (selectedChannel) {
    return (
      <div className="flex flex-col h-[calc(100vh-12rem)] bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border bg-secondary/30">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setSelectedChannel(null); setMessages([]); }}
            className="h-9 w-9"
          >
            <ArrowLeft className={`h-5 w-5 ${dir === "rtl" ? "rotate-180" : ""}`} />
          </Button>
          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{selectedChannel.channel_name}</h3>
            <p className="text-xs text-muted-foreground">
              {messages.length} {lang === "ar" ? "رسالة" : "messages"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadMessages(selectedChannel.id, 0, false)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (lang === "ar" ? "تحديث" : "Refresh")}
          </Button>
        </div>

        {/* Messages — telegram-like */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/50">
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
                <div key={m.id} className="flex flex-col items-start max-w-[85%]">
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm">
                    {/* Media preview */}
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

                    {/* Document/Audio/Voice */}
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

                    {/* Text content */}
                    {(m.message_text || m.media_caption) && (
                      <div className="px-3 py-2">
                        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                          {m.message_text || m.media_caption}
                        </div>
                      </div>
                    )}

                    {/* Footer */}
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
      </div>
    );
  }

  // ─── Channel list ───
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={lang === "ar" ? "ابحث عن قناة..." : "Search channels..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredChannels.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm bg-card border border-border rounded-xl">
          {lang === "ar" ? "لا توجد قنوات" : "No channels"}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {filteredChannels.map((ch, idx) => (
            <button
              key={ch.id}
              onClick={() => openChannel(ch)}
              className={`w-full flex items-center gap-3 p-4 hover:bg-secondary/40 transition-colors text-left ${
                idx !== filteredChannels.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Tv className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">{ch.channel_name}</div>
                <div className="text-xs text-muted-foreground">
                  {counts[ch.id] || 0} {lang === "ar" ? "رسالة" : "messages"}
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {ch.channel_type}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
