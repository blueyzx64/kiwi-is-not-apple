#!/usr/bin/env python3
# dbus-run-session stand-in for hosts with dbus-broker only (Fedora): a private session bus
# through dbus-broker-launch and socket activation, no service activation. Put a symlink named
# dbus-run-session to this file first in PATH to run tools/smoke/run-headless.sh.
#   dbus-run-session-broker.py [--] command [args...]
import os
import signal
import socket
import subprocess
import sys
import tempfile

args = sys.argv[1:]
if args and args[0] == '--':
    args = args[1:]
conf = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'session-bus.conf')
path = os.path.join(tempfile.mkdtemp(prefix='kiwi-bus-'), 'bus')
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.bind(path)
sock.listen(64)
pid = os.fork()
if pid == 0:
    # systemd socket activation: the listening socket is fd 3
    if sock.fileno() != 3:
        os.dup2(sock.fileno(), 3)
    os.set_inheritable(3, True)
    env = dict(os.environ, LISTEN_FDS='1', LISTEN_PID=str(os.getpid()))
    os.execvpe('dbus-broker-launch', ['dbus-broker-launch', '--scope', 'user', '--config-file', conf], env)
sock.close()
rc = subprocess.call(args, env=dict(os.environ, DBUS_SESSION_BUS_ADDRESS='unix:path=' + path))
os.kill(pid, signal.SIGTERM)
os.waitpid(pid, 0)
sys.exit(rc)
