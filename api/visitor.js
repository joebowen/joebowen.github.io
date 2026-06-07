import crypto from "crypto";

export default async function handler(req, res) {
  const allowedOrigins = [
    "https://joebowen.github.io",
    "https://joebowen-github-io.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173"
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://joebowen.github.io");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
    const lookupIp = normalizeIpForLookup(ip);

    if (!ip) {
      console.error("Could not determine visitor IP address.");
    }

    if (!lookupIp) {
      console.error("Could not determine a public visitor IP address.", {
        ip
      });
    }

    if (lookupIp) {
      const userAgent = req.headers["user-agent"] || null;
      const ipHash = hashIp(lookupIp, ipHashSalt);

      const todayStart = getTodayStartIsoUTC();
      const tomorrowStart = getTomorrowStartIsoUTC();

      const existingVisitsToday = await supabaseRequest(
        supabaseUrl,
        supabaseServiceRoleKey,
        `/rest/v1/visitor_locations?select=id&ip_hash=eq.${encodeURIComponent(
          ipHash
        )}&visited_at=gte.${encodeURIComponent(
          todayStart
        )}&visited_at=lt.${encodeURIComponent(tomorrowStart)}&limit=1`
      );

      const alreadyVisitedToday =
        Array.isArray(existingVisitsToday) && existingVisitsToday.length > 0;

      if (!alreadyVisitedToday) {
        await tryInsertVisitorLocation({
          supabaseUrl,
          supabaseServiceRoleKey,
          lookupIp,
          ipHash,
          userAgent
        });
      }
    }

    const rows = await supabaseRequest(
      supabaseUrl,
      supabaseServiceRoleKey,
      "/rest/v1/visitor_locations?select=city,region,country,latitude,longitude,visited_at&order=visited_at.desc&limit=10000"
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

async function tryInsertVisitorLocation({
  supabaseUrl,
  supabaseServiceRoleKey,
  lookupIp,
  ipHash,
  userAgent
}) {
  try {
    const geoResponse = await fetch(`https://ipapi.co/${lookupIp}/json/`, {
      headers: {
        "User-Agent": "joebowen-visitor-map/1.0"
      }
    });

    if (!geoResponse.ok) {
      const errorText = await geoResponse.text();

      console.error("IP geolocation request failed:", {
        status: geoResponse.status,
        statusText: geoResponse.statusText,
        body: errorText,
        lookupIp
      });

      return;
    }

    const geo = await geoResponse.json();

    if (geo.error) {
      console.error("IP geolocation lookup failed:", {
        reason: geo.reason || "Unknown geolocation error.",
        lookupIp
      });

      return;
    }

    const city = geo.city || null;
    const region = geo.region || null;
    const country = geo.country_name || null;
    const latitude = Number(geo.latitude);
    const longitude = Number(geo.longitude);

    const hasValidCoordinates =
      Number.isFinite(latitude) && Number.isFinite(longitude);

    if (!hasValidCoordinates) {
      console.error("IP geolocation returned invalid coordinates:", {
        lookupIp,
        city,
        region,
        country,
        latitude: geo.latitude,
        longitude: geo.longitude
      });

      return;
    }

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
  } catch (error) {
    console.error("Could not insert visitor location:", error);
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

  if (isPrivateIpv4(cleanIp)) {
    return null;
  }

  return cleanIp;
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
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
  const headers = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (options.method && options.method !== "GET") {
    headers.Prefer = "return=minimal";
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    method: options.method || "GET",
    headers,
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
    const city = cleanLocationPart(row.city, "Unknown city");
    const region = cleanLocationPart(row.region, "Unknown region");
    const country = cleanLocationPart(row.country, "Unknown country");
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const key = createLocationKey(city, region, country);

    if (!locationMap.has(key)) {
      locationMap.set(key, {
        city,
        region,
        country,
        latitudeSum: 0,
        longitudeSum: 0,
        coordinateCount: 0,
        visits: 0
      });
    }

    const location = locationMap.get(key);

    location.latitudeSum += latitude;
    location.longitudeSum += longitude;
    location.coordinateCount += 1;
    location.visits += 1;
  }

  return Array.from(locationMap.values())
    .map(location => ({
      city: location.city,
      region: location.region,
      country: location.country,
      latitude: location.latitudeSum / location.coordinateCount,
      longitude: location.longitudeSum / location.coordinateCount,
      visits: location.visits
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 250);
}

function cleanLocationPart(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.trim();

  return cleaned || fallback;
}

function createLocationKey(city, region, country) {
  return [
    city.toLowerCase(),
    region.toLowerCase(),
    country.toLowerCase()
  ].join("|");
}