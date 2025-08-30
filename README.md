# How to JWKS

This repository demonstrates a robust approach to implementing JSON Web Key Set (JWKS) authentication. After wrestling with key rotation, token validation, and session management across multiple projects, I've settled on this pattern that keeps things simple and reliable.

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
    // Generate new key pair
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    const newKid = crypto.randomUUID();
    
    // Store in Redis
    await redis.set(KEY_PEM_PREFIX + newKid, await jose.exportPKCS8(privateKey));
    await redis.set(KEY_JWK_PREFIX + newKid, JSON.stringify(await jose.exportJWK(publicKey)));
    await redis.set(ACTIVE_KID_KEY, newKid);
    await redis.zadd(RECENT_KEYS_ZSET, Date.now(), newKid);
    
    kid = newKid;
  }
  
  return { kid, privateKey, publicJwk };
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
  
  const keys = [];
  for (const kid of kids) {
    if (revoked.has(kid)) continue;

    const jwkStr = await redis.get(KEY_JWK_PREFIX + kid);

    if (jwkStr) keys.push(JSON.parse(jwkStr));
  }
  
  return { keys };
}
```

### Authentication Flow

1. **Startup**: App calls `ensureActiveKey()` to guarantee an active key
2. **Login**: User authenticates with OTP, receives JWT signed with active key
3. **Validation**: Services validate JWT using local JWK set from Redis
4. **Rotation**: Admin triggers key rotation, old keys remain valid for existing tokens

### Token Creation

```typescript
export async function createAccessToken(userId: string, sessionId: string) {
  const { key, kid } = await getActivePrivateKeyAndKid();
  
  return await new jose.SignJWT({
    sub: userId,
    jti: sessionId
  })
    .setIssuedAt()
    .setIssuer(envs.app.ISSUER)
    .setExpirationTime(Date.now() + envs.app.ACCESS_TOKEN_EXPIRY_MS)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .sign(key);
}
```

### Token Validation

```typescript
export async function validateToken(token: string) {
  const jwks = await getLocalJwkSet();

  const { payload } = await jose.jwtVerify(token, jwks);

  return payload;
}
```

## API Endpoints

### `GET /auth/jwks`
Returns the JSON Web Key Set for token validation:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "uuid-here",
      "alg": "RS256",
      "use": "sig",
      "n": "...",
      "e": "..."
    }
  ]
}
```

### `POST /auth/request-otp`
Request a one-time password for authentication.

### `POST /auth/login`
Authenticate with OTP and receive JWT tokens.

### `POST /auth/refresh`
Refresh access token using refresh token.

### `POST /auth/logout`
Invalidate current session.

## Configuration

### Environment Variables

```bash
# App Configuration
APP_ENV=dev                    # dev | prod
PORT=3333                      # Server port
ISSUER=how-to-jwks            # JWT issuer claim
JWKS_MAX_KEYS=5               # Number of recent keys to keep
ACCESS_TOKEN_EXPIRY_MS=900000 # 15 minutes
REFRESH_TOKEN_EXPIRY_MS=2592000000 # 30 days

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Redis
REDIS_URL=redis://localhost:6379
```

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/Vicentesan/how-to-jwks.git 
   cd how-to-jwks
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start services**
   ```bash
   # Start Redis and PostgreSQL
   docker-compose up -d
   
   # Run database migrations
   bun run db:migrate
   ```

5. **Start development server**
   ```bash
   bun run dev
   ```

6. **View API documentation**
   ```
   http://localhost:3333/docs
   ```

## Key Rotation

To rotate keys (recommended periodically or after security incidents):

```typescript
// Call the rotation endpoint or function
await rotateKeys();
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