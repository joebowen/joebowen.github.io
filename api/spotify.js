const allowedOrigins = [
  "https://joebowen.dev",
  "https://www.joebowen.dev",
  "https://joebowen.github.io",
  "https://joebowen-github-io.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173"
];

export default async function handler(req, res) {
  const origin = req.headers.origin;
  res.setHeader(
    "Access-Control-Allow-Origin",
    allowedOrigins.includes(origin) ? origin : "https://joebowen.dev"
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    return res.status(500).json({ error: "Missing Spotify environment variables." });
  }

  try {
    const accessToken = await getAccessToken(
      SPOTIFY_CLIENT_ID,
      SPOTIFY_CLIENT_SECRET,
      SPOTIFY_REFRESH_TOKEN
    );

    const track = (await getCurrentlyPlaying(accessToken)) || (await getLastPlayed(accessToken));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(track || { isPlaying: false, track: null });
  } catch (error) {
    console.error("Spotify API error:", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Could not reach Spotify." });
  }
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getCurrentlyPlaying(accessToken) {
  const response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // 204 = nothing playing
  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`currently-playing failed: ${response.status}`);
  }

  const data = await response.json();
  // Ignore podcasts/ads; fall back to recently-played instead.
  if (data?.currently_playing_type !== "track" || !data.item) {
    return null;
  }

  // A paused track is the real "last played" song: recently-played only logs
  // a track once it finishes or is skipped, so it would show the one before.
  if (!data.is_playing) {
    const pausedAt = data.timestamp ? new Date(data.timestamp).toISOString() : null;
    return { isPlaying: false, playedAt: pausedAt, track: formatTrack(data.item) };
  }

  return { isPlaying: true, playedAt: null, track: formatTrack(data.item) };
}

async function getLastPlayed(accessToken) {
  const response = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=1",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`recently-played failed: ${response.status}`);
  }

  const data = await response.json();
  const item = data?.items?.[0];
  if (!item?.track) return null;

  return { isPlaying: false, playedAt: item.played_at, track: formatTrack(item.track) };
}

function formatTrack(track) {
  const images = track.album?.images || [];
  // Images come largest-first; pick the smallest that's still >= 160px for a 72px slot.
  const cover =
    [...images].reverse().find(img => (img.width || 0) >= 160)?.url ||
    images[0]?.url ||
    null;

  return {
    title: track.name,
    artist: (track.artists || []).map(a => a.name).join(", "),
    album: track.album?.name || null,
    cover,
    url: track.external_urls?.spotify || null
  };
}
