import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ipHashSalt = process.env.IP_HASH_SALT;

    if (!supabaseUrl || !supabaseServiceRoleKey || !ipHashSalt) {
      return res.status(500).json({
        error: "Missing Supabase environment variables."
      });
    }

    const ip = getClientIp(req);

    if (!ip) {
      return res.status(400).json({
        error: "Could not determine visitor IP address."
      });
    }

    const lookupIp = normalizeIpForLookup(ip);

    if (!lookupIp) {
      return res.status(400).json({
        error: "Could not determine a public visitor IP address."
      });
    }

    const userAgent = req.headers["user-agent"] || null;
    const ipHash = hashIp(lookupIp, ipHashSalt);

    const todayStart = getTodayStartIsoUTC();
    const tomorrowStart = getTomorrowStartIsoUTC();

    const existingVisitsToday = await supabaseRequest(
      supabaseUrl,
      supabaseServiceRoleKey,
      `/rest/v1/visitor_locations?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&visited_at=gte.${encodeURIComponent(todayStart)}&visited_at=lt.${encodeURIComponent(tomorrowStart)}&limit=1`
    );

    const alreadyVisitedToday =
      Array.isArray(existingVisitsToday) && existingVisitsToday.length > 0;

    if (!alreadyVisitedToday) {
      const geoResponse = await fetch(`https://ipapi.co/${lookupIp}/json/`, {
        headers: {
          "User-Agent": "joebowen-visitor-map/1.0"
        }
      });

      if (!geoResponse.ok) {
        return res.status(502).json({
          error: "Could not fetch IP geolocation data."
        });
      }

      const geo = await geoResponse.json();

      if (geo.error) {
        return res.status(502).json({
          error: geo.reason || "IP geolocation lookup failed."
        });
      }

      const city = geo.city || null;
      const region = geo.region || null;
      const country = geo.country_name || null;
      const latitude = Number(geo.latitude);
      const longitude = Number(geo.longitude);

      const hasValidCoordinates =
        Number.isFinite(latitude) && Number.isFinite(longitude);

      if (hasValidCoordinates) {
        await supabaseRequest(
          supabaseUrl,
          supabaseServiceRoleKey,
          "/rest/v1/visitor_locations",
          {
            method: "POST",
            body: JSON.stringify({
              ip_hash: ipHash,
              city,
              region,
              country,
              latitude,
              longitude,
              user_agent: userAgent
            })
          }
        );
      }
    }

    const rows = await supabaseRequest(
      supabaseUrl,
      supabaseServiceRoleKey,
      "/rest/v1/visitor_locations?select=city,region,country,latitude,longitude"
    );

    const locations = aggregateLocations(rows);

    return res.status(200).json({
      success: true,
      locations
    });
  } catch (error) {
    console.error("Visitor API error:", error);

    return res.status(500).json({
      error: "Could not process visitor location."
    });
  }
}

function getClientIp(req) {
  const vercelForwardedFor = req.headers["x-vercel-forwarded-for"];
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const cfConnectingIp = req.headers["cf-connecting-ip"];
  const socketIp = req.socket?.remoteAddress;

  const candidates = [
    vercelForwardedFor,
    forwardedFor,
    realIp,
    cfConnectingIp,
    socketIp
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length === 0) {
      continue;
    }

    const ip = candidate.split(",")[0].trim();

    if (ip) {
      return ip;
    }
  }

  return null;
}

function normalizeIpForLookup(ip) {
  if (!ip) return null;

  let cleanIp = String(ip).trim();

  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.replace("::ffff:", "");
  }

  const localhostIps = new Set([
    "::1",
    "127.0.0.1",
    "localhost",
    "0.0.0.0"
  ]);

  if (localhostIps.has(cleanIp)) {
    return null;
  }

  return cleanIp;
}

function hashIp(ip, salt) {
  return crypto
    .createHash("sha256")
    .update(`${ip}:${salt}`)
    .digest("hex");
}

function getTodayStartIsoUTC() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  ).toISOString();
}

function getTomorrowStartIsoUTC() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  ).toISOString();
}

async function supabaseRequest(
  supabaseUrl,
  supabaseServiceRoleKey,
  path,
  options = {}
) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(options.headers || {})
    },
    body: options.body
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Supabase request failed: ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function aggregateLocations(rows) {
  const locationMap = new Map();

  for (const row of rows || []) {
    const city = row.city || "";
    const region = row.region || "";
    const country = row.country || "";
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const key = `${city}|${region}|${country}|${latitude}|${longitude}`;

    if (!locationMap.has(key)) {
      locationMap.set(key, {
        city,
        region,
        country,
        latitude,
        longitude,
        visits: 0
      });
    }

    locationMap.get(key).visits += 1;
  }

  return Array.from(locationMap.values())
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 100);
}