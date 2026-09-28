# Custom domains

Users can serve dynamic codes from their own hostname, for example `qr.mycompany.com/r/menu`, instead of the server's primary domain. Ownership is verified with a DNS TXT record, and certificates can be issued automatically by Caddy using Let's Encrypt.

## Adding a domain

1. Add the hostname under **Dashboard → Domains**, or with `POST /api/v1/domains`.
2. Create the two DNS records QRForge displays:

   | Type | Name | Value |
   | --- | --- | --- |
   | `CNAME` (or `A`/`AAAA`) | `qr.mycompany.com` | your QRForge server |
   | `TXT` | `_qrforge-challenge.qr.mycompany.com` | `qrforge-verify=<token>` |

3. Select **Verify**. The server looks up the TXT record (`POST /api/v1/domains/{id}/verify`) and marks the domain as verified, or responds with `422 verification_failed`.
4. Assign codes to the domain. Their `redirect_url` becomes `https://qr.mycompany.com/r/<slug>`. The scheme comes from `QRFORGE_CUSTOM_DOMAIN_SCHEME` (default `https`).

Behavior:

- Hostnames are normalized to lowercase without a trailing dot. IP addresses, `localhost`-style names and the primary host are rejected.
- A hostname can belong to only one account.
- On a custom domain, only codes assigned to that domain resolve. The primary domain resolves every code.
- Codes assigned to an unverified domain keep using the primary base URL.
- Removing a domain moves its codes back to the primary domain. Printed codes that use the custom hostname stop working.

## TLS certificates

The reverse proxy must terminate TLS for every custom hostname and forward the original `Host` header.

### Caddy on-demand TLS

Caddy can obtain a certificate the first time a hostname is requested. To prevent arbitrary domains from being pointed at the server and using up certificate rate limits, Caddy first asks QRForge whether the hostname is allowed:

```text
GET /api/v1/domains/check?domain=qr.mycompany.com
```

QRForge responds with `200` for the primary host and verified custom domains, and `404` otherwise. The repository's `docker/Caddyfile` uses this endpoint:

```text
{
	email {$ACME_EMAIL}
	on_demand_tls {
		ask http://qrforge:8080/api/v1/domains/check
	}
}

{$QRFORGE_DOMAIN} {
	encode zstd gzip
	reverse_proxy qrforge:8080
}

https:// {
	tls {
		on_demand
	}
	reverse_proxy qrforge:8080
}
```

Start it with the Compose overlay:

```bash
QRFORGE_DOMAIN=qr.example.com ACME_EMAIL=you@example.com \
  docker compose -f docker-compose.yml -f docker/docker-compose.caddy.yml up -d
```

### nginx

nginx cannot issue certificates on demand. Add a `server` block for each verified domain and obtain certificates with [certbot](https://certbot.eff.org):

```nginx
server {
    listen 443 ssl http2;
    server_name qr.mycompany.com;
    ssl_certificate     /etc/letsencrypt/live/qr.mycompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qr.mycompany.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
certbot certonly --nginx -d qr.mycompany.com
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Verification fails | `dig TXT _qrforge-challenge.qr.mycompany.com` returns the exact value. DNS changes can take several minutes to propagate. |
| Certificate errors | The hostname's `A` or `CNAME` record points to the proxy, and ports 80 and 443 are reachable for the ACME challenge. |
| 404 on a custom domain | The code is assigned to that domain, and the proxy forwards the original `Host` header. |
