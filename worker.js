export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS (biar bisa dipanggil dari github pages)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/search") {
      const q = url.searchParams.get("q") || "";
      const limit = Math.max(1, Math.min(60, parseInt(url.searchParams.get("limit") || "20", 10)));

      if (!q.trim()) {
        return new Response("Missing q", { status: 400, headers: corsHeaders });
      }
      if (!env.GOOGLE_PLACES_KEY) {
        return new Response("Missing GOOGLE_PLACES_KEY in env", { status: 500, headers: corsHeaders });
      }

      // 1) Text Search
      const textSearchUrl =
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${env.GOOGLE_PLACES_KEY}`;

      const ts = await fetch(textSearchUrl);
      const tsJson = await ts.json();

      if (tsJson.status !== "OK" && tsJson.status !== "ZERO_RESULTS") {
        return new Response(JSON.stringify(tsJson), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const candidates = (tsJson.results || []).slice(0, limit);

      // 2) Details per place (ambil phone, opening hours, url)
      const out = [];
      for (const p of candidates) {
        const placeId = p.place_id;
        if (!placeId) continue;

        const detailsUrl =
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}` +
          `&fields=name,formatted_address,rating,formatted_phone_number,opening_hours,url` +
          `&key=${env.GOOGLE_PLACES_KEY}`;

        const det = await fetch(detailsUrl);
        const detJson = await det.json();

        if (detJson.status !== "OK") continue;

        const r = detJson.result || {};
        out.push({
          nama: r.name || p.name || "",
          alamat: r.formatted_address || p.formatted_address || "",
          rating: (r.rating ?? p.rating ?? "").toString(),
          telepon: r.formatted_phone_number || "",
          jam_buka: (r.opening_hours?.weekday_text || []).join(" | "),
          link: r.url || "",
        });
      }

      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
