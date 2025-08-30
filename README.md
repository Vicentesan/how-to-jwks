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

  let kid = await redis.get(ACTIVE_KID_KEY);
  
  if (!kid) {
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });

    const newKid = crypto.randomUUID();
    const pem = await jose.exportPKCS8(privateKey);
    const jwk = await jose.exportJWK(publicKey);

    jwk.kid = newKid;
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    await redis.set(KEY_PEM_PREFIX + newKid, pem);
    await redis.set(KEY_JWK_PREFIX + newKid, JSON.stringify(jwk));
    await redis.set(ACTIVE_KID_KEY, newKid);
    await redis.zadd(RECENT_KEYS_ZSET, Date.now(), newKid);

    const keep = await getKeepCount();
    const total = await redis.zcard(RECENT_KEYS_ZSET);

    if (total > keep) {
      const toRemove = await redis.zrange(RECENT_KEYS_ZSET, 0, total - keep - 1);

      for (const rk of toRemove) {
        await redis.del(KEY_PEM_PREFIX + rk);
        await redis.del(KEY_JWK_PREFIX + rk);
      }

      await redis.zrem(RECENT_KEYS_ZSET, ...toRemove);
    }

    kid = newKid;
  }

  const pem = await redis.get(KEY_PEM_PREFIX + kid);
  const privateKey = pem ? await jose.importPKCS8(pem, 'RS256') : null;
  const jwkStr = await redis.get(KEY_JWK_PREFIX + kid);
  const publicJwk = jwkStr ? (JSON.parse(jwkStr) as jose.JWK) : null;

  return {
    kid,
    privateKey: privateKey!,
    publicJwk: publicJwk!,
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

  const keep = await getKeepCount();
  const kids = await redis.zrevrange(RECENT_KEYS_ZSET, 0, keep - 1);

  const revoked = new Set(await redis.smembers(REVOKED_KEYS_SET));
  const keys = [] as jose.JWK[];

  for (const kid of kids) {
    if (revoked.has(kid)) continue;

    const jwkStr = await redis.get(KEY_JWK_PREFIX + kid);

    if (!jwkStr) continue;

    const jwk = JSON.parse(jwkStr) as jose.JWK;

    keys.push(jwk);
  }

  return { keys };
}
```

#### `getActivePrivateKeyAndKid()`
Gets the currently active private key for signing tokens:

```typescript
export async function getActivePrivateKeyAndKid() {
  const redis = getRedis();

  const kid = await redis.get(ACTIVE_KID_KEY);

  if (!kid) {
    const active = await ensureActiveKey();
    return { key: active.privateKey, kid: active.kid };
  }

  const pem = await redis.get(KEY_PEM_PREFIX + kid);
  const key = await jose.importPKCS8(pem!, 'RS256');

  return { key, kid };
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

  const kid = crypto.randomUUID();
  const pem = await jose.exportPKCS8(privateKey);
  const jwk = await jose.exportJWK(publicKey);

  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  await redis.set(KEY_PEM_PREFIX + kid, pem);
  await redis.set(KEY_JWK_PREFIX + kid, JSON.stringify(jwk));
  await redis.set(ACTIVE_KID_KEY, kid);
  await redis.zadd(RECENT_KEYS_ZSET, Date.now(), kid);

  const keep = await getKeepCount();
  const total = await redis.zcard(RECENT_KEYS_ZSET);

  if (total > keep) {
    const toRemove = await redis.zrange(RECENT_KEYS_ZSET, 0, total - keep - 1);

    for (const rk of toRemove) {
      await redis.del(KEY_PEM_PREFIX + rk);
      await redis.del(KEY_JWK_PREFIX + rk);
    }

    await redis.zrem(RECENT_KEYS_ZSET, ...toRemove);
  }
  
  return { kid, privateKey };
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