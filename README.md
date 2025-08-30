# How to JWKS

This repo is my first shot at building a simple way to do JWKS (JSON Web Key Set) authentication. I learned the basics from [Diego Fernandes (@dieegosf)](https://x.com/dieegosf) and then dove into key rotation, token validation, and session management. I kept it straightforward and reliable. Big shoutout to Diego for teaching me the fundamentals of JWKS and inspiring me to write this blog post at WIP.

This is a living document for everyone. Feel free to open issues if you want to discuss improvements, edge cases, or share your own experiences. Pull requests are totally welcome. Let's learn and improve together!

> **New to JWKS or JWTs?** If you landed here and aren't sure what any of this means, check out the full article at WIP for a complete walkthrough of JSON Web Tokens and JSON Web Key Sets.

## The Problem

Getting JWKS working sounds simple until you actually try to do it. Then you run into stuff like:

-  **Key rotation nightmares**: When do you rotate? How long do you keep old keys?
-  **Race conditions**: Tokens signed with old keys while new keys are being deployed
-  **State management**: Keeping track of which keys are active, revoked, or expired
-  **Distributed complexity**: Making sure all your services can verify tokens consistently

Most solutions I’ve seen either overcomplicate things or ignore these edge cases. This implementation focuses on keeping it simple and reliable.

## The Solution

The core idea is: **manage all your keys in Redis with clear rules**.

### Key Principles

1. **Always have an active key**: The system makes sure there’s always a valid key for signing tokens.
2. **Keep recent keys for validation**: Store the last N keys to handle tokens signed before rotation.
3. **Use Redis for persistence**: Keys survive restarts and stay fast.
4. **Single source of truth**: One function to get keys, one to rotate them.

## Implementation Details

### Key Management

Keys are stored in Redis with this structure:

#### Redis Keys Overview

| Key Pattern | Type | Purpose | Example |
|-------------|------|---------|---------|
| `auth:keys:active` | String | Stores the currently active key ID for signing tokens | `"abc123-def456"` |
| `auth:keys:pem:{kid}` | String | Private key in PEM format for signing JWTs | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `auth:keys:jwk:{kid}` | String | Public key in JWK format for token validation | `{"kty":"RSA","kid":"abc123-def456",...}` |
| `auth:keys:recent` | Sorted Set | Recent key IDs ordered by creation timestamp | `[{"score":1703123456789,"member":"abc123-def456"}]` |
| `auth:keys:revoked` | Set | Key IDs that have been revoked and should not be used | `["old-key-123","compromised-key-456"]` |

#### Key Details

- **`auth:keys:active`** - Single string value containing the key ID that should be used for signing new tokens
- **`auth:keys:pem:{kid}`** - Private key material in PKCS8 PEM format, used by the signing function
- **`auth:keys:jwk:{kid}`** - Public key in JSON Web Key format, included in the JWKS endpoint for validation
- **`auth:keys:recent`** - Sorted set where score is timestamp, used to track key creation order and cleanup old keys
- **`auth:keys:revoked`** - Set of key IDs that have been explicitly revoked, these keys are excluded from JWKS

### Core Functions

#### `ensureActiveKey()`
Guarantees an active key exists, creating one if needed:

```typescript
export async function ensureActiveKey() {
  const redis = getRedis();
  
  // Check if we have an active key
  let activeKeyId = await redis.get(ACTIVE_KID_KEY);
  
  if (!activeKeyId) {
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    
    const keyId = crypto.randomUUID();
    
    // Prepare the public key for storage
    const publicJwk = await jose.exportJWK(publicKey);
    publicJwk.kid = keyId;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    
    // Store everything in Redis
    await redis.set(KEY_PEM_PREFIX + keyId, await jose.exportPKCS8(privateKey));
    await redis.set(KEY_JWK_PREFIX + keyId, JSON.stringify(publicJwk));
    await redis.set(ACTIVE_KID_KEY, keyId);
    await redis.zadd(RECENT_KEYS_ZSET, Date.now(), keyId);
    
    // Clean up old keys if we have too many
    const maxKeys = await getKeepCount();
    const currentKeyCount = await redis.zcard(RECENT_KEYS_ZSET);
    
    if (currentKeyCount > maxKeys) {
      const oldKeys = await redis.zrange(RECENT_KEYS_ZSET, 0, currentKeyCount - maxKeys - 1);
      
      for (const oldKeyId of oldKeys) {
        await revokeKey(oldKeyId);
      }
      
      await redis.zrem(RECENT_KEYS_ZSET, ...oldKeys);
    }
    
    activeKeyId = keyId;
  }
  
  // Load the key data
  const privateKeyPem = await redis.get(KEY_PEM_PREFIX + activeKeyId);
  const publicKeyJson = await redis.get(KEY_JWK_PREFIX + activeKeyId);
  
  const privateKey = await jose.importPKCS8(privateKeyPem!, 'RS256');
  const publicJwk = JSON.parse(publicKeyJson!);
  
  return {
    kid: activeKeyId,
    privateKey,
    publicJwk,
    createdAt: new Date(),
    active: true
  };
}
```

#### `getJWKS()`
Returns the current set of valid public keys:

```typescript
export async function getJWKS() {
  const redis = getRedis();
  
  const maxKeys = await getKeepCount();
  const recentKeyIds = await redis.zrevrange(RECENT_KEYS_ZSET, 0, maxKeys - 1);
  const revokedKeys = new Set(await redis.smembers(REVOKED_KEYS_SET));
  
  const validKeys = [];
  
  for (const keyId of recentKeyIds) {
    if (revokedKeys.has(keyId)) continue;
    
    const keyData = await redis.get(KEY_JWK_PREFIX + keyId);
    if (!keyData) continue;
    
    validKeys.push(JSON.parse(keyData));
  }
  
  return { keys: validKeys };
}
```

#### `getActivePrivateKeyAndKid()`
Gets the current private key for signing tokens:

```typescript
export async function getActivePrivateKeyAndKid() {
  const redis = getRedis();
  
  const activeKeyId = await redis.get(ACTIVE_KID_KEY);
  
  if (!activeKeyId) {
    const active = await ensureActiveKey();
    return { key: active.privateKey, kid: active.kid };
  }
  
  const privateKeyPem = await redis.get(KEY_PEM_PREFIX + activeKeyId);
  const privateKey = await jose.importPKCS8(privateKeyPem!, 'RS256');
  
  return { key: privateKey, kid: activeKeyId };
}
```

#### `getLocalJwkSet()`
Creates a local JWK set for token validation:

```typescript
export async function getLocalJwkSet() {
  const jwks = await getJWKS();
  
  return jose.createLocalJWKSet(jwks);
}
```

#### `revokeKey()`
Revoke an existent active keypair:

```typescript
export async function revokeKey(kid: string) {
  const redis = getRedis();

  await redis.sadd(REVOKED_KEYS_SET, kid);
  await redis.del(KEY_PEM_PREFIX + kid);
  await redis.del(KEY_JWK_PREFIX + kid);
}
```

### Authentication Flow

1. **Startup**: Call `ensureActiveKey()` to make sure a key exists.
2. **Login**: Sign tokens with the active private key.
3. **Validation**: Verify tokens with the JWKS fetched from Redis.
4. **Rotation**: Run `rotateKeys()` periodically or after a security event to generate new keys, keep old ones for validation, and remove expired keys.

### Token Creation

```typescript
export async function createAccessToken({ userId, sessionId }) {
  const { key, kid } = await getActivePrivateKeyAndKid();

  const accessToken = await new jose.SignJWT({
    sub: userId,
    jti: sessionId
  })
    .setIssuedAt()
    .setIssuer(envs.app.ISSUER)
    .setExpirationTime(Date.now() + envs.app.ACCESS_TOKEN_EXPIRY_MS)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .sign(key);

  return { accessToken };
}
```

### Token Validation

```typescript
export async function validateAccessToken(token: string) {
  try {
    const jwkSet = await getLocalJwkSet();
    const { payload } = await jose.jwtVerify(token, jwkSet, {
      algorithms: ['RS256'],
      issuer: envs.app.ISSUER,
    });

    const userId = payload.sub as string;
    const sessionId = payload.jti as string;

    if (!userId || !sessionId) {
      return { userId: null, sessionId: null, isValid: false };
    }

    return {
      userId,
      sessionId,
      isValid: true
    };
  } catch {
    return { userId: null, sessionId: null, isValid: false };
  }
}
```

## Configuration

### Environment Variables

```bash
# App Configuration
ISSUER=how-to-jwks            # JWT issuer claim
JWKS_MAX_KEYS=5               # Number of recent keys to keep
ACCESS_TOKEN_EXPIRY_MS=900000 # 15 minutes
REFRESH_TOKEN_EXPIRY_MS=2592000000 # 30 days

# Redis
REDIS_URL=redis://localhost:6379
```

## Key Rotation

To rotate keys (recommended regularly or after a breach):

```typescript
export async function rotateKeys() {
  const redis = getRedis();
  
  const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
  const keyId = crypto.randomUUID();
  
  const publicJwk = await jose.exportJWK(publicKey);
  publicJwk.kid = keyId;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  
  await redis.set(KEY_PEM_PREFIX + keyId, await jose.exportPKCS8(privateKey));
  await redis.set(KEY_JWK_PREFIX + keyId, JSON.stringify(publicJwk));
  await redis.set(ACTIVE_KID_KEY, keyId);
  await redis.zadd(RECENT_KEYS_ZSET, Date.now(), keyId);
  
  const maxKeys = await getKeepCount();
  const currentKeyCount = await redis.zcard(RECENT_KEYS_ZSET);
  
  if (currentKeyCount > maxKeys) {
    const oldKeys = await redis.zrange(RECENT_KEYS_ZSET, 0, currentKeyCount - maxKeys - 1);
    
    for (const oldKeyId of oldKeys) {
      await revokeKey(oldKeyId);
    }
    
    await redis.zrem(RECENT_KEYS_ZSET, ...oldKeys);
  }
  
  return { kid: keyId, privateKey };
}
```

This creates a new key pair, sets it as active, and cleans up old keys.

## Best Practices

-  Use RS256 (RSA) instead of HS256 (HMAC) for distributed systems
-  Rotate keys often (monthly recommended)
-  Keep private keys secure
-  Use HTTPS in production
-  Cache JWKS responses in your services
-  Log rotation events and token validation failures

## Routes You’ll Need

### Public

-  `GET /.well-known/jwks.json` — Serves your JWKS for other services to verify tokens

### Protected

-  Middleware to verify JWTs using your JWKS
-  Admin routes to rotate or revoke keys

Feel free to open issues or send pull requests to improve this. This is just a basic starting point. Let’s build on it!
