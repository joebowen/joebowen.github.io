// One-off helper: gets a Spotify refresh token for api/spotify.js.
//
// 1. In the Spotify developer dashboard, add this Redirect URI to your app:
//      http://127.0.0.1:8888/callback
// 2. Run (PowerShell):
//      $env:SPOTIFY_CLIENT_ID="..."; $env:SPOTIFY_CLIENT_SECRET="..."; node scripts/spotify-auth.mjs
// 3. Open the printed URL, approve, and copy the refresh token it prints.

import http from "node:http";
import crypto from "node:crypto";

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.");
  process.exit(1);
}

const port = 8888;
const redirectUri = `http://127.0.0.1:${port}/callback`;
const scopes = "user-read-currently-playing user-read-recently-played";
const state = crypto.randomBytes(16).toString("hex");

const authUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  if (url.searchParams.get("state") !== state) {
    res.writeHead(400).end("State mismatch.");
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end(`Authorization failed: ${url.searchParams.get("error")}`);
    server.close();
    return;
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.refresh_token) {
    console.error("Token exchange failed:", data);
    res.writeHead(500).end("Token exchange failed. See terminal.");
  } else {
    console.log("\nSPOTIFY_REFRESH_TOKEN=" + data.refresh_token + "\n");
    res.writeHead(200, { "Content-Type": "text/plain" })
      .end("Done. Copy the refresh token from your terminal; you can close this tab.");
  }

  server.close();
});

server.listen(port, "127.0.0.1", () => {
  console.log("Open this URL in your browser:\n\n" + authUrl + "\n");
});
