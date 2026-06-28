// Utility to generate a JWT for Google Service Account using Web Crypto API
// This avoids needing heavy Node.js dependencies in Cloudflare Workers

function base64url(source) {
  let encodedSource = btoa(String.fromCharCode.apply(null, new Uint8Array(source)));
  return encodedSource.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}

function textToBase64url(text) {
  return base64url(new TextEncoder().encode(text));
}

function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

export async function getGoogleAuthToken(serviceAccountJson) {
  const serviceAccount = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  
  const signatureInput = textToBase64url(JSON.stringify(header)) + "." + textToBase64url(JSON.stringify(claim));
  
  // Format the private key
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key.substring(
    pemHeader.length,
    serviceAccount.private_key.length - pemFooter.length - 1
  ).replace(/\\s/g, '');
  
  const binaryDerString = atob(pemContents);
  const binaryDer = str2ab(binaryDerString);
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" }
    },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signatureInput)
  );
  
  const jwt = signatureInput + "." + base64url(signature);
  
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}
