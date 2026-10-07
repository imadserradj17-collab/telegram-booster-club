import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const fileId = url.searchParams.get("file_id");
    const messageId = url.searchParams.get("message_id");
    if (!fileId || !messageId) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the message belongs to the user
    const { data: msg } = await sb
      .from("channel_messages")
      .select("id, owner_id, bot_token_id")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg || msg.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get bot token
    const { data: botRow } = await sb
      .from("bot_tokens")
      .select("token")
      .eq("id", msg.bot_token_id)
      .maybeSingle();

    if (!botRow?.token) {
      return new Response(JSON.stringify({ error: "Bot token not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // getFile from telegram
    const fileRes = await fetch(
      `https://api.telegram.org/bot${botRow.token}/getFile?file_id=${fileId}`,
    );
    const fileData = await fileRes.json();
    if (!fileData.ok) {
      return new Response(JSON.stringify({ error: fileData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filePath = fileData.result.file_path;
    const downloadRes = await fetch(
      `https://api.telegram.org/file/bot${botRow.token}/${filePath}`,
    );
    if (!downloadRes.ok) {
      return new Response(JSON.stringify({ error: "Download failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = downloadRes.headers.get("Content-Type") ||
      "application/octet-stream";
    return new Response(downloadRes.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
