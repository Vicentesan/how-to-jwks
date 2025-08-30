# How to JWKS

This repository demonstrates my first attempt at implementing JSON Web Key Set (JWKS) authentication. After learning the basics from [Diego Fernandes (@dieegosf)](https://x.com/dieegosf) and diving deep into key rotation, token validation, and session management, I've created this implementation that keeps things simple and reliable. A huge shoutout to Diego for teaching me the fundamentals of JWKS and inspiring me to create this blog post available at [vicentesan.dev/blog/how-to-jwks](https://vicentesan.dev/blog/how-to-jwks).

This is a living document for the community. Feel free to open issues to discuss improvements, edge cases, or share your experiences. Pull requests are welcome to enhance the implementation, fix bugs, or add new features. Let's learn and improve together!

## The Problem

JWKS authentication sounds straightforward until you actually implement it. You quickly run into:

- **Key rotation nightmares**: When do you rotate? How long do you keep old keys?
- **Race conditions**: Tokens signed with old keys while new keys are being deployed
- **State management**: Keeping track of which keys are active, revoked, or expired
- **Distributed complexity**: Ensuring all your services can validate tokens consistently

Most solutions I've seen either over-engineer the problem or ignore critical edge cases. This implementation focuses on simplicity and reliability.

## The Solution

The core idea is simple: **centralize all key management in Redis with clear lifecycle rules**.

### Key Principles

1. **Always have an active key**: The system ensures there's always a valid key for signing tokens
2. **Keep recent keys for validation**: Store the last N keys to handle tokens signed before rotation
3. **Use Redis for persistence**: Keys survive restarts but stay in memory for performance
4. **Single source of truth**: One function to get keys, one function to rotate them

## Implementation Details

### Key Management

Keys are stored in Redis with the following structure:

- `auth:keys:active` - The currently active key ID
- `auth:keys:pem:{kid}` - Private key PEM for signing
- `auth:keys:jwk:{kid}` - Public key JWK for validation
- `auth:keys:recent` - Sorted set of recent key IDs (by timestamp)
- `auth:keys:revoked` - Set of revoked key IDs

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
        await redis.del(KEY_PEM_PREFIX + oldKeyId);
        await redis.del(KEY_JWK_PREFIX + oldKeyId);
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
Gets the currently active private key for signing tokens:

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

### Authentication Flow

1. **Startup**: App calls `ensureActiveKey()` to guarantee an active key
2. **Login**: User authenticates with OTP, receives JWT signed with active key
3. **Validation**: Services validate JWT using local JWK set from Redis
4. **Rotation**: Admin triggers key rotation, old keys remain valid for existing tokens

### Token Creation

```typescript
export async function createAccessToken(options: CreateAccessTokenOptions) {
  const { userId, sessionId } = options;
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

To rotate keys (recommended periodically or after security incidents):

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
      await redis.del(KEY_PEM_PREFIX + oldKeyId);
      await redis.del(KEY_JWK_PREFIX + oldKeyId);
    }
    
    await redis.zrem(RECENT_KEYS_ZSET, ...oldKeys);
  }
  
  return { kid: keyId, privateKey };
}
```

This will:
1. Generate a new key pair
2. Mark the new key as active
3. Keep the old key for token validation
4. Clean up keys beyond the retention limit

## Best Practices

### Security
- Use RS256 (RSA) instead of HS256 (HMAC) for distributed systems
- Rotate keys regularly (monthly recommended)
- Keep private keys secure and never expose them
- Use HTTPS in production

### Performance
- Cache JWKS responses in your services
- Use Redis for key storage (fast, persistent)
- Keep a reasonable number of recent keys (5-10)

### Monitoring
- Log key rotation events
- Monitor token validation failures
- Track key usage patterns

## Required Routes

Here are the essential routes you'll need for JWKS functionality:

### Public Endpoints

- **`GET /.well-known/jwks.json`** - Serves your JWKS (JSON Web Key Set) publicly
  - Returns the current set of valid public keys
  - Used by other services to validate your JWT tokens
  - Should be publicly accessible without authentication

### Authentication Middleware

- **Auth Middleware** - Validates JWT tokens in protected routes
  - Extracts Bearer token from Authorization header
  - Validates token using your JWKS
  - Adds user information to request object
  - Returns 401 for invalid/missing tokens

### Admin Endpoints (Protected)

- **`POST /rotate-keys`** - Rotates the active signing key
  - Generates new key pair
  - Makes new key active for signing
  - Keeps old keys for token validation
  - Cleans up expired keys

- **`POST /revoke-key`** - Revokes a specific key
  - Adds key ID to revoked set
  - Key will no longer be included in JWKS
  - Existing tokens signed with this key become invalid

## What This Doesn't Cover

This implementation focuses on the core JWKS authentication flow. You'll still need to handle:

- User registration and profile management
- Email delivery for OTP codes
- Rate limiting and abuse prevention
- Password reset flows
- Multi-factor authentication
- Audit logging
- Metrics and monitoring

## Contributing

Feel free to open issues or submit pull requests for improvements. This is meant to be a practical reference implementation that others can build upon.

## License

MIT License - see LICENSE file for details.