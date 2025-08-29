import * as jose from 'jose';
import { getRedis } from '@/shared/cache/index';
import { envs } from '@/shared/config/envs';

const ACTIVE_KID_KEY = 'auth:keys:active';
const KEY_PEM_PREFIX = 'auth:keys:pem:';
const KEY_JWK_PREFIX = 'auth:keys:jwk:';
const RECENT_KEYS_ZSET = 'auth:keys:recent';
const REVOKED_KEYS_SET = 'auth:keys:revoked';

async function getKeepCount() {
  return envs.app.JWKS_MAX_KEYS ?? 5;
}

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

export async function revokeKey(kid: string) {
  const redis = getRedis();

  await redis.sadd(REVOKED_KEYS_SET, kid);
  await redis.del(KEY_PEM_PREFIX + kid);
}

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

export async function getLocalJwkSet() {
  const jwks = await getJWKS();

  return jose.createLocalJWKSet(jwks);
}

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
