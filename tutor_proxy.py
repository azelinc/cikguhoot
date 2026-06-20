#!/usr/bin/env python3
"""
Cikgu Hoot Tutor Proxy
Bridges between the PWA (browser) and DeepSeek API.
Runs on port 8001, exposed via Traefik at tutor.azelinc.tech
"""
import os, json, sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
if not DEEPSEEK_KEY:
    # Fallback: read from ibu profile
    try:
        with open("/opt/data/profiles/ibu/.env") as f:
            for line in f:
                if line.startswith("DEEPSEEK_API_KEY="):
                    DEEPSEEK_KEY = line.strip().split("=", 1)[1]
                    break
    except Exception as e:
        print(f"FATAL: No DeepSeek API key: {e}", flush=True)
        sys.exit(1)

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

class TutorHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/tutor":
            self.handle_tutor()
        else:
            self.send_error(404)

    def handle_tutor(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        system = body.get("system", "You are Cikgu Hoot, a friendly tutor.")
        messages = body.get("messages", [])
        model = body.get("model", "deepseek-chat")

        # Build DeepSeek request
        ds_messages = [{"role": "system", "content": system}]
        for m in messages[-20:]:  # Keep last 20 for context window
            ds_messages.append({"role": m["role"], "content": m["content"]})

        payload = json.dumps({
            "model": "deepseek-chat",
            "messages": ds_messages,
            "max_tokens": 1024,
            "temperature": 0.7,
            "stream": False,
        }).encode()

        req = Request(DEEPSEEK_URL, data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
            })

        try:
            resp = urlopen(req, timeout=30)
            data = json.loads(resp.read())
            reply = data["choices"][0]["message"]["content"]

            self.send_response(200)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "role": "assistant",
                "content": reply,
            }).encode())

        except URLError as e:
            self.send_response(502)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "upstream_error",
                "detail": str(e.reason)[:200]
            }).encode())
        except Exception as e:
            self.send_response(500)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "internal_error",
                "detail": str(e)[:200]
            }).encode())

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def log_message(self, fmt, *args):
        print(f"[TutorProxy] {args[0]} {args[1]} {args[2]}", flush=True)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    server = HTTPServer(("0.0.0.0", port), TutorHandler)
    print(f"[TutorProxy] Running on 0.0.0.0:{port}", flush=True)
    server.serve_forever()
