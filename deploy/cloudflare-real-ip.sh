#!/usr/bin/env bash
# Tells Nginx which addresses are Cloudflare, so the visitor's REAL address (CF-Connecting-IP) is used for the audit log and the
# login throttle instead of a Cloudflare server's address. Run once on the server, then again every few months:
#   sudo bash deploy/cloudflare-real-ip.sh
set -euo pipefail

out=/etc/nginx/conf.d/cloudflare-real-ip.conf
tmp=$(mktemp)
{
  echo "# Generated from https://www.cloudflare.com/ips on $(date -u +%F). Re-run deploy/cloudflare-real-ip.sh now and then."
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4); do echo "set_real_ip_from $ip;"; done
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v6); do echo "set_real_ip_from $ip;"; done
  echo "real_ip_header CF-Connecting-IP;"
} > "$tmp"
install -m 644 "$tmp" "$out"
rm -f "$tmp"
nginx -t && systemctl reload nginx
echo "Done: $out"
