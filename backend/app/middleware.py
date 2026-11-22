import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


class SecurityMiddleware(BaseHTTPMiddleware):
    """Простая защита API: заголовки + in-memory rate limiting по IP."""

    def __init__(self, app):
        super().__init__(app)
        self.window = 60
        self.limit = max(settings.rate_limit_per_minute, 1)
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.max_tracked_ips = 10000

    def client_ip(self, request: Request) -> str:
        #nginx передаёт реальный IP в X-Real-IP; бэкенд слушает только localhost.
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def check(self, ip: str) -> tuple[bool, int, int]:
        now = time.monotonic()
        bucket = self.hits[ip]
        while bucket and now - bucket[0] >= self.window:
            bucket.popleft()

        reset = int(bucket[0] + self.window - now) + 1 if bucket else self.window
        if len(bucket) >= self.limit:
            return False, reset, 0

        bucket.append(now)
        if len(self.hits) > self.max_tracked_ips:
            for key in list(self.hits):
                own = self.hits[key]
                if not own or now - own[-1] >= self.window:
                    del self.hits[key]

        return True, reset, self.limit - len(bucket)

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health" or request.method == "OPTIONS":
            response = await call_next(request)
        else:
            allowed, reset, remaining = self.check(self.client_ip(request))
            if not allowed:
                response = JSONResponse(
                    status_code=429,
                    content={"detail": "Слишком много запросов. Повторите позже."},
                    headers={"Retry-After": str(reset)},
                )
            else:
                response = await call_next(request)
                response.headers["X-RateLimit-Limit"] = str(self.limit)
                response.headers["X-RateLimit-Remaining"] = str(remaining)
                response.headers["X-RateLimit-Reset"] = str(reset)

        for key, value in SECURITY_HEADERS.items():
            if key not in response.headers:
                response.headers[key] = value
        if request.url.path.startswith("/api/") and "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"

        return response
