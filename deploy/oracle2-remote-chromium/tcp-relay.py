#!/usr/bin/env python3
"""Container-loopback-only TCP relay to the Job Harness server container.
No listening socket exposed to the host, tailnet or other Docker containers.
The relay does not log HTTP headers, credentials or payloads.
"""
import select
import socket
import socketserver

LISTEN = ("127.0.0.1", 20901)
UPSTREAM = ("job-harness-server-1", 3000)

class Relay(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            with socket.create_connection(UPSTREAM, timeout=8) as upstream:
                self.request.settimeout(None)
                upstream.settimeout(None)
                sockets = (self.request, upstream)
                active = set(sockets)
                while active:
                    ready, _, _ = select.select(list(active), [], [], 60)
                    for current in ready:
                        try:
                            chunk = current.recv(65536)
                        except (OSError, ConnectionError):
                            chunk = b""
                        dest = upstream if current is self.request else self.request
                        if not chunk:
                            active.discard(current)
                            try:
                                dest.shutdown(socket.SHUT_WR)
                            except OSError:
                                pass
                            continue
                        try:
                            dest.sendall(chunk)
                        except (OSError, ConnectionError):
                            return
        except (OSError, ConnectionError):
            return

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

with Server(LISTEN, Relay) as server:
    server.serve_forever(poll_interval=0.5)
