"""Fail-closed API identity, durable quotas, and privacy-safe audit records."""
import hashlib
import hmac
import json
import os
import time
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit
import jwt
from fastapi import HTTPException

principal = ContextVar('scamshield_principal', default=None)

def secret(name):
    """Read vault-injected files or runtime environment; never return values in logs."""
    filename = os.getenv(name + '_FILE')
    if filename:
        return Path(filename).read_text().strip()
    return os.getenv(name, '')

def owner_id():
    user = principal.get()
    if not user:
        raise HTTPException(401, 'Authentication required')
    return user['id']

@lru_cache(maxsize=4)
def key_client(url):
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=300, timeout=5)

def authenticate(request):
    # Explicit test/local mode is restricted to loopback/TestClient. Never set in cloud.
    if os.getenv('SCAMSHIELD_DEV_AUTH') == '1' and request.client and request.client.host in ('127.0.0.1', '::1', 'testclient'):
        return {'id': 'local-developer', 'roles': ['user', 'auditor'], 'mode': 'local-development'}
    issuer = os.getenv('OIDC_ISSUER', '')
    audience = os.getenv('OIDC_AUDIENCE', '')
    jwks = os.getenv('OIDC_JWKS_URL', '')
    if not issuer or not audience or urlsplit(jwks).scheme != 'https':
        raise HTTPException(503, 'Identity provider is not configured')
    value = request.headers.get('authorization', '')
    if not value.startswith('Bearer ') or len(value) > 16000:
        raise HTTPException(401, 'Bearer access token required')
    try:
        token = value[7:]
        key = key_client(jwks).get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=['RS256'], issuer=issuer, audience=audience,
                            options={'require': ['exp', 'iat', 'sub', 'iss', 'aud']}, leeway=0)
        if not isinstance(claims['sub'], str) or not claims['sub'] or claims['exp'] - claims['iat'] > 3600:
            raise ValueError('Invalid token lifetime or subject')
        # Provider must assert MFA in the *signed access token*. No client-supplied flags.
        required_acr = os.getenv('OIDC_MFA_ACR', '')
        if required_acr:
            mfa = claims.get('acr') == required_acr
        else:
            amr = claims.get('amr', [])
            mfa = isinstance(amr, list) and 'mfa' in amr
        if not mfa:
            raise HTTPException(403, 'Multi-factor authentication required')
        roles = claims.get(os.getenv('OIDC_ROLE_CLAIM', 'roles'), [])
        if not isinstance(roles, list) or not all(isinstance(r, str) for r in roles):
            raise ValueError('Invalid role claim')
        subject = hashlib.sha256((issuer + '\x00' + claims['sub']).encode()).hexdigest()
        return {'id': subject, 'roles': roles, 'mode': 'oidc'}
    except HTTPException:
        raise
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, 'Invalid or expired access token') from None

def authorize(user, method, path):
    roles = set(user['roles'])
    if path.startswith('/ops/'):
        if 'auditor' not in roles:
            raise HTTPException(403, 'Auditor role required')
    elif not roles.intersection({'user', 'reader'}):
        raise HTTPException(403, 'Application role required')
    elif method not in ('GET', 'HEAD') and 'user' not in roles:
        raise HTTPException(403, 'Write permission required')

def audit_key():
    key = secret('SCAMSHIELD_AUDIT_KEY')
    if len(key) < 32:
        if os.getenv('SCAMSHIELD_DEV_AUTH') == '1':
            # Ephemeral development records are deliberately not a production ledger.
            return 'development-ledger-key-not-for-production'
        raise HTTPException(503, 'Audit signing key is not configured')
    return key

def rate_limit(connect, bucket, limit, seconds=60):
    now = int(time.time())
    with connect() as con:
        con.execute('DELETE FROM rate_limits WHERE window < ?', (now // seconds - 2,))
        row = con.execute('INSERT INTO rate_limits(bucket,window,count) VALUES(?,?,1) '
                          'ON CONFLICT(bucket,window) DO UPDATE SET count=count+1 RETURNING count',
                          (bucket, now // seconds)).fetchone()
    if row[0] > limit:
        raise HTTPException(429, 'Rate limit exceeded', headers={'Retry-After': str(seconds - now % seconds)})

def append_audit_in_transaction(con, event):
    key = audit_key().encode()
    body = json.dumps(event, sort_keys=True, separators=(',', ':'))
    last = con.execute('SELECT digest FROM audit_events ORDER BY seq DESC LIMIT 1').fetchone()
    previous = last[0] if last else '0' * 64
    digest = hmac.new(key, (previous + '\n' + body).encode(), hashlib.sha256).hexdigest()
    con.execute('INSERT INTO audit_events(body,previous,digest) VALUES(?,?,?)', (body, previous, digest))
    return digest

def append_audit(connect, event):
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        return append_audit_in_transaction(con, event)


def verify_audit(rows, key):
    previous = '0' * 64
    expected_seq = 1
    for seq, body, parent, digest in rows:
        expected = hmac.new(key.encode(), (previous + '\n' + body).encode(), hashlib.sha256).hexdigest()
        if seq != expected_seq or parent != previous or not hmac.compare_digest(expected, digest):
            return False
        previous = digest
        expected_seq += 1
    return True
