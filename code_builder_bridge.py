#!/usr/bin/env python3
"""
CraftForge Education Edition - Full Education & Agent Code Builder Bridge + Web IDE Server
Provides:
 1. Education Code Builder TCP Server (Port 4711)
 2. In-Game Code Builder Web IDE Server (Port 8080) for visual block & Python scripting
 3. Agent Robot 3D Entity Spawner & Movement Dispatcher
 4. Chemistry Elements & Compound Helpers
"""
import sys
import time
import json
import socket
import threading
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs

HOST = '127.0.0.1'
PORT = 4711
WEB_PORT = 8080

agent_state = {
    "spawned": False,
    "x": 0, "y": 64, "z": 0,
    "direction": "forward"
}

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CraftForge Education - Code Builder IDE</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        body { 
            background: rgba(15, 23, 42, 0.90); 
            backdrop-filter: blur(16px); 
            -webkit-backdrop-filter: blur(16px);
            color: #f8fafc; 
            display: flex; 
            flex-direction: column; 
            height: 100vh; 
            overflow: hidden;
            border-right: 2px solid rgba(56, 189, 248, 0.4);
            box-shadow: 8px 0 24px rgba(0, 0, 0, 0.5);
        }
        header { 
            background: rgba(30, 41, 59, 0.8); 
            padding: 10px 14px; 
            border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            -webkit-app-region: drag;
        }
        .logo { font-size: 0.95rem; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 6px; }
        .status { font-size: 0.75rem; background: rgba(6, 78, 59, 0.8); color: #34d399; padding: 3px 8px; border-radius: 9999px; font-weight: 600; border: 1px solid #059669; }
        main { display: flex; flex-direction: column; flex: 1; overflow: hidden; padding: 10px; gap: 10px; }
        .controls { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
        .section-title { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 700; margin-bottom: 4px; }
        .btn { background: #3b82f6; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; -webkit-app-region: no-drag; }
        .btn:hover { background: #2563eb; transform: translateY(-1px); }
        .btn-success { background: #10b981; }
        .btn-success:hover { background: #059669; }
        .btn-warning { background: #f59e0b; color: #000; }
        .btn-warning:hover { background: #d97706; }
        .btn-purple { background: #8b5cf6; }
        .btn-purple:hover { background: #7c3aed; }
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .editor-container { display: flex; flex-direction: column; flex: 1; min-height: 0; background: rgba(9, 13, 22, 0.85); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; }
        textarea { flex: 1; background: transparent; color: #38bdf8; font-family: 'Consolas', 'Courier New', monospace; font-size: 0.9rem; padding: 12px; border: none; resize: none; outline: none; line-height: 1.5; }
        .action-bar { background: rgba(30, 41, 59, 0.8); padding: 8px 12px; border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; gap: 8px; }
        .console { background: rgba(2, 6, 23, 0.95); border-top: 1px solid rgba(255, 255, 255, 0.1); height: 100px; padding: 8px 12px; font-family: monospace; font-size: 0.75rem; color: #a7f3d0; overflow-y: auto; }
    </style>
</head>
<body>
    <header>
        <div class="logo">🎓 CraftForge Edu IDE</div>
        <div class="status">🟢 Aktif (N Kapatır)</div>
    </header>
    <main>
        <div class="controls">
            <div class="section-title">🤖 Agent Robot Aksiyonları</div>
            <button class="btn btn-success" onclick="runCmd('agent.spawn()')">✨ Agent Robot Çağır / Işınla</button>
            <div class="grid-4" style="margin-top: 4px;">
                <button class="btn" onclick="runCmd('agent.move(\\'forward\\', 1)')">⬆️ İleri</button>
                <button class="btn" onclick="runCmd('agent.move(\\'back\\', 1)')">⬇️ Geri</button>
                <button class="btn" onclick="runCmd('agent.move(\\'left\\', 1)')">⬅️ Sol</button>
                <button class="btn" onclick="runCmd('agent.move(\\'right\\', 1)')">➡️ Sağ</button>
            </div>
            <div class="grid-2" style="margin-top: 4px;">
                <button class="btn btn-warning" onclick="runCmd('agent.place()')">🧱 Blok Koy</button>
                <button class="btn btn-warning" onclick="runCmd('agent.destroy()')">⛏️ Blok Kır</button>
            </div>
        </div>
        <div class="editor-container">
            <textarea id="codeEditor" spellcheck="false"># CraftForge Education - Python Script
agent.spawn()

# Önümüzde çimen varsa kır
if agent.detect("forward") == "grass_block":
    player.say("Çimen tespit edildi, kırılıyor...")
    agent.destroy()

# Kule yapımı
for i in range(3):
    agent.place()
    agent.move("up", 1)
player.say("İşlem tamamlandı!")
</textarea>
            <div class="action-bar">
                <button class="btn btn-success" style="flex: 2;" onclick="executeScript()">▶️ Oyunda Çalıştır</button>
                <button class="btn" style="flex: 1; background: #475569;" onclick="document.getElementById('codeEditor').value=''">🧹 Temizle</button>
            </div>
            <div class="console" id="console">💻 Konsol Hazır. (N tuşu paneli açar/kapatır)\n</div>
        </div>
    </main>
    <script>
        function log(msg) {
            const c = document.getElementById('console');
            c.innerText += msg + '\\n';
            c.scrollTop = c.scrollHeight;
        }
        function runCmd(cmd) {
            log('⚡ ' + cmd);
            fetch('/api/run', { method: 'POST', body: cmd })
                .then(r => r.text())
                .then(res => log('✅ ' + res))
                .catch(err => log('❌ ' + err));
        }
        function executeScript() {
            const code = document.getElementById('codeEditor').value;
            log('🚀 Script Çalıştırılıyor...');
            fetch('/api/run', { method: 'POST', body: code })
                .then(r => r.text())
                .then(res => log('🎉 ' + res))
                .catch(err => log('❌ Hata: ' + err));
        }
    </script>
</body>
</html>"""

def get_data_dir():
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA')
        if appdata:
            return os.path.join(appdata, 'KodlandLauncher')
        return os.path.expanduser('~\\AppData\\Roaming\\KodlandLauncher')
    elif sys.platform == 'darwin':
        return os.path.expanduser('~/Library/Application Support/KodlandLauncher')
    else:
        xdg_data = os.environ.get('XDG_DATA_HOME')
        if xdg_data:
            return os.path.join(xdg_data, 'KodlandLauncher')
        return os.path.expanduser('~/.local/share/KodlandLauncher')

def get_detected_blocks():
    blocks_file = os.path.join(get_data_dir(), "edu_blocks.json")
    try:
        if os.path.exists(blocks_file):
            with open(blocks_file, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {"forward": "air", "down": "air", "up": "air"}

execution_state = {
    "cancelled": False,
    "current_token": 0,
    "active_thread": None
}

def stop_current_execution():
    execution_state["cancelled"] = True
    execution_state["current_token"] += 1

class AgentAPI:
    def __init__(self, check_func=None):
        self.check_func = check_func

    def _guard(self):
        if self.check_func:
            self.check_func()

    def spawn(self):
        self._guard()
        res = bridge_instance._process_command("agent.spawn()")
        time.sleep(0.05)
        return res

    def move(self, direction="forward", steps=1):
        self._guard()
        res = bridge_instance._process_command(f"agent.move('{direction}', {steps})")
        time.sleep(0.05)
        return res

    def turn(self, direction="right"):
        self._guard()
        res = bridge_instance._process_command(f"agent.turn('{direction}')")
        time.sleep(0.05)
        return res

    def look(self, direction="right"):
        self._guard()
        res = bridge_instance._process_command(f"agent.look('{direction}')")
        time.sleep(0.05)
        return res

    def place(self, direction="forward", block="stone"):
        self._guard()
        res = bridge_instance._process_command(f"agent.place('{direction}', '{block}')")
        time.sleep(0.05)
        return res

    def destroy(self, direction="forward"):
        self._guard()
        res = bridge_instance._process_command(f"agent.destroy('{direction}')")
        time.sleep(0.05)
        return res

    def break_block(self, direction="forward"):
        return self.destroy(direction)

    def detect(self, direction="forward"):
        self._guard()
        dir_clean = str(direction).lower().strip()
        if dir_clean in ("front", "forward", "ahead"):
            dir_key = "forward"
        elif dir_clean in ("down", "below", "bottom"):
            dir_key = "down"
        elif dir_clean in ("up", "above", "top"):
            dir_key = "up"
        else:
            dir_key = "forward"
        blocks = get_detected_blocks()
        time.sleep(0.02)
        return blocks.get(dir_key, "air")

    def inspect(self, direction="forward"):
        return self.detect(direction)

    def detectBlock(self, direction="forward"):
        return self.detect(direction)

class PlayerAPI:
    def say(self, msg):
        mc_cmd = f"say [Edu Script] {msg}"
        bridge_instance._dispatch_mc_command(mc_cmd)
        return "OK"

class WorldAPI:
    def setBlock(self, x, y, z, block):
        block_str = str(block).replace('minecraft:', '')
        mc_cmd = f"execute at @p run setblock {x} {y} {z} minecraft:{block_str}"
        bridge_instance._dispatch_mc_command(mc_cmd)
        return "OK"

class ChemistryAPI:
    def giveElement(self, element):
        mc_cmd = f'give @p minecraft:glowstone_dust[custom_name=\'{"text":"Element: {element}"}\'] 64'
        bridge_instance._dispatch_mc_command(mc_cmd)
        return "OK"

class WebIDEHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/trigger_overlay':
            data_dir = get_data_dir()
            os.makedirs(data_dir, exist_ok=True)
            flag_file = os.path.join(data_dir, "open_ide.flag")
            try:
                with open(flag_file, "w") as f:
                    f.write(str(time.time()))
            except Exception:
                pass
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
            return
        elif self.path == '/api/stop':
            stop_current_execution()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b"OK: Execution Stopped")
            return

        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(HTML_TEMPLATE.encode('utf-8'))

    def do_POST(self):
        if self.path == '/api/stop':
            stop_current_execution()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b"OK: Execution Stopped")
            return

        if self.path == '/api/run':
            length = int(self.headers.get('Content-Length', 0))
            code = self.rfile.read(length).decode('utf-8')

            # Cancel previous execution and spawn isolated runner thread
            stop_current_execution()
            time.sleep(0.02)
            execution_state["cancelled"] = False
            my_token = execution_state["current_token"]
            start_time = time.time()
            step_counter = [0]

            def check_guard():
                if execution_state["cancelled"] or execution_state["current_token"] != my_token:
                    raise RuntimeError("🛑 Arayüz açıldığı için çalışan kod durduruldu.")
                if time.time() - start_time > 10.0:
                    raise RuntimeError("⚠️ Zaman aşımı! Kod 10 saniyeden uzun sürdüğü için durduruldu.")

            def tracer(frame, event, arg):
                check_guard()
                if event == 'line':
                    step_counter[0] += 1
                    if step_counter[0] > 1000:
                        raise RuntimeError("⚠️ Döngü sınırı aşıldı! Maksimum 1000 döngü / adım sınırına ulaşıldı.")
                return tracer

            scope = {
                'agent': AgentAPI(check_guard),
                'player': PlayerAPI(),
                'world': WorldAPI(),
                'chemistry': ChemistryAPI(),
                'range': range,
                'len': len,
                'str': str,
                'int': int,
                'float': float,
                'bool': bool,
                'print': print,
                'time': time
            }

            try:
                sys.settrace(tracer)
                exec(code, scope)
                sys.settrace(None)
                res = "🎉 Python scripti başarıyla çalıştırıldı!"
            except RuntimeError as re:
                sys.settrace(None)
                res = str(re)
                player_msg = str(re).replace('🛑 ', '').replace('⚠️ ', '')
                PlayerAPI().say(player_msg)
            except Exception as e:
                sys.settrace(None)
                res = f"❌ Python Hatası: {e}"
                PlayerAPI().say(f"Python Hatası: {e}")

            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(res.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return  # Silence HTTP server output

class CodeBuilderBridge:
    def __init__(self, host=HOST, port=PORT):
        self.host = host
        self.port = port
        self.running = False
        self.sock = None

    def start(self):
        self.running = True
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, 'SO_REUSEPORT'):
            try:
                self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except Exception:
                pass
        try:
            self.sock.bind((self.host, self.port))
            self.sock.listen(5)
            print(f"🎓 [CraftForge Edu] Agent TCP Server -> {self.host}:{self.port}")
        except Exception as e:
            print(f"⚠️ [CraftForge Edu] TCP Server Error: {e}")

        # Start Web IDE Server on 8080 with socket reuse
        def run_web():
            try:
                class ReuseHTTPServer(HTTPServer):
                    allow_reuse_address = True
                server = ReuseHTTPServer((HOST, WEB_PORT), WebIDEHandler)
                print(f"🌐 [CraftForge Edu] Oyun İçi Code Builder Web IDE -> http://{HOST}:{WEB_PORT}")
                server.serve_forever()
            except Exception as e:
                print(f"⚠️ Web IDE Error: {e}")

        threading.Thread(target=run_web, daemon=True).start()
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def _accept_loop(self):
        while self.running:
            try:
                conn, addr = self.sock.accept()
                threading.Thread(target=self._handle_client, args=(conn, addr), daemon=True).start()
            except Exception:
                break

    def _handle_client(self, conn, addr):
        with conn:
            buffer = ""
            while self.running:
                data = conn.recv(1024)
                if not data:
                    break
                buffer += data.decode('utf-8', errors='ignore')
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    line = line.strip()
                    if line:
                        response = self._process_command(line)
                        if response is not None:
                            conn.sendall((response + '\n').encode('utf-8'))

    def _process_command(self, cmd):
        print(f"💻 [Edu Script Command]: {cmd}")
        if cmd.startswith("agent.spawn"):
            tp_cmd = 'execute at @p run tp @e[tag=agent_robot,limit=1] ^ ^0 ^2'
            summon_cmd = 'execute at @p unless entity @e[tag=agent_robot] run summon iron_golem ^ ^0 ^2 {CustomName:\'"Agent Robot"\',CustomNameVisible:1b,NoAI:1b,Invulnerable:1b,Tags:["agent_robot"]}'
            self._dispatch_mc_command(tp_cmd)
            self._dispatch_mc_command(summon_cmd)
            return "OK: Agent Robot Teleported / Spawned on ground"

        elif cmd.startswith("agent.turn") or cmd.startswith("agent.look"):
            parts = cmd.split("(")
            dir_arg = "right"
            if len(parts) > 1:
                dir_arg = parts[1].rstrip(")").replace('"', '').replace("'", '').strip().lower()
            
            if dir_arg in ("right", "east"):
                mc_cmd = 'execute as @e[tag=agent_robot,limit=1] at @s run tp @s ~ ~ ~ ~90 ~'
            elif dir_arg in ("left", "west"):
                mc_cmd = 'execute as @e[tag=agent_robot,limit=1] at @s run tp @s ~ ~ ~ ~-90 ~'
            elif dir_arg in ("back", "north"):
                mc_cmd = 'execute as @e[tag=agent_robot,limit=1] at @s run tp @s ~ ~ ~ ~180 ~'
            elif dir_arg == "south":
                mc_cmd = 'execute as @e[tag=agent_robot,limit=1] at @s run tp @s ~ ~ ~ 0 0'
            else:
                mc_cmd = 'execute as @e[tag=agent_robot,limit=1] at @s run tp @s ~ ~ ~ ~90 ~'

            self._dispatch_mc_command(mc_cmd)
            return f"OK: Agent turned/looked {dir_arg}"
            
        elif cmd.startswith("agent.move"):
            parts = cmd.split("(")
            direction = "forward"
            steps = 1
            if len(parts) > 1:
                args = parts[1].rstrip(")").replace('"', '').replace("'", '').split(",")
                direction = args[0].strip() if len(args) > 0 else "forward"
                steps = int(args[1].strip()) if len(args) > 1 and args[1].strip().isdigit() else 1
            
            lr = steps if direction == 'right' else (-steps if direction == 'left' else 0)
            ud = steps if direction == 'up' else (-steps if direction == 'down' else 0)
            fb = steps if direction == 'forward' else (-steps if direction == 'back' else 0)

            mc_cmd = f'execute as @e[tag=agent_robot,limit=1] at @s run tp @s ^{lr} ^{ud} ^{fb}'
            self._dispatch_mc_command(mc_cmd)
            return f"OK: Agent moved {direction} by {steps}"

        elif cmd.startswith("agent.place"):
            parts = cmd.split("(")
            direction = "forward"
            block = "stone"
            if len(parts) > 1:
                args = [a.strip().replace('"', '').replace("'", '') for a in parts[1].rstrip(")").split(",")]
                if len(args) > 0 and args[0]:
                    direction = args[0].lower()
                if len(args) > 1 and args[1]:
                    block = args[1].replace('minecraft:', '')
            
            if direction in ("down", "below", "bottom"):
                offset = "^ ^-1 ^"
            elif direction in ("up", "above", "top"):
                offset = "^ ^1 ^"
            elif direction in ("back", "behind"):
                offset = "^ ^0 ^-1.5"
            elif direction in ("left", "west"):
                offset = "^-1.5 ^0 ^"
            elif direction in ("right", "east"):
                offset = "^1.5 ^0 ^"
            else:
                offset = "^ ^0 ^1.5"

            mc_cmd = f'execute at @e[tag=agent_robot,limit=1] run setblock {offset} minecraft:{block}'
            self._dispatch_mc_command(mc_cmd)
            return f"OK: Agent placed {block} {direction}"

        elif cmd.startswith("agent.destroy") or cmd.startswith("agent.break"):
            parts = cmd.split("(")
            direction = "forward"
            if len(parts) > 1:
                args = [a.strip().replace('"', '').replace("'", '') for a in parts[1].rstrip(")").split(",")]
                if len(args) > 0 and args[0]:
                    direction = args[0].lower()

            if direction in ("down", "below", "bottom"):
                offset = "^ ^-1 ^"
            elif direction in ("up", "above", "top"):
                offset = "^ ^1 ^"
            elif direction in ("back", "behind"):
                offset = "^ ^0 ^-1.5"
            elif direction in ("left", "west"):
                offset = "^-1.5 ^0 ^"
            elif direction in ("right", "east"):
                offset = "^1.5 ^0 ^"
            else:
                offset = "^ ^0 ^1.5"

            mc_cmd = f'execute at @e[tag=agent_robot,limit=1] run setblock {offset} minecraft:air destroy'
            self._dispatch_mc_command(mc_cmd)
            return f"OK: Agent destroyed block {direction}"

        elif cmd.startswith("world.setBlock"):
            parts = cmd.split("(")
            if len(parts) > 1:
                args = [a.strip().replace('"', '').replace("'", '') for a in parts[1].rstrip(")").split(",")]
                if len(args) >= 4:
                    mc_cmd = f"execute at @p run setblock {args[0]} {args[1]} {args[2]} minecraft:{args[3]}"
                    self._dispatch_mc_command(mc_cmd)
            return "OK: Block placed in world"

        elif cmd.startswith("chemistry.giveElement"):
            parts = cmd.split("(")
            if len(parts) > 1:
                element = parts[1].rstrip(")").replace('"', '').replace("'", '').strip()
                mc_cmd = f'give @p minecraft:glowstone_dust[custom_name=\'{"text":"Element: {element}"}\'] 64'
                self._dispatch_mc_command(mc_cmd)
            return "OK: Chemistry Element Given"

        elif cmd.startswith("player.say"):
            msg = cmd.split("(")[1].rstrip(")").replace('"', '').replace("'", '')
            mc_cmd = f"say [Edu Script] {msg}"
            self._dispatch_mc_command(mc_cmd)
            return "OK"

        return "OK"

    def _dispatch_mc_command(self, mc_cmd):
        print(f"⚡ [Minecraft Command Dispatch]: /{mc_cmd}")
        data_dir = get_data_dir()
        ipc_file = os.path.join(data_dir, "edu_commands.log")
        try:
            os.makedirs(os.path.dirname(ipc_file), exist_ok=True)
            with open(ipc_file, "a", encoding="utf-8") as f:
                f.write(mc_cmd + "\n")
        except Exception:
            pass

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def log_bridge(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {msg}\n"
    try:
        if sys.stdout and hasattr(sys.stdout, 'buffer'):
            sys.stdout.buffer.write(log_line.encode('utf-8', errors='replace'))
            sys.stdout.flush()
        else:
            print(log_line.encode('ascii', errors='replace').decode('ascii'), end="")
    except Exception:
        pass

    try:
        data_dir = get_data_dir()
        log_file = os.path.join(data_dir, "bridge.log")
        os.makedirs(data_dir, exist_ok=True)
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception:
        pass

def is_already_running():
    test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        test_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        test_sock.bind((HOST, PORT))
        test_sock.close()
        return False
    except Exception as e:
        log_bridge(f"[WARN] Port {PORT} check failed ({e}). Assuming instance is already running or port is blocked.")
        return True

if __name__ == '__main__':
    log_bridge("==================================================")
    log_bridge(f"🚀 Starting CraftForge Edu Bridge Daemon (PID: {os.getpid()})")
    log_bridge(f"📂 Data directory: {get_data_dir()}")
    if is_already_running():
        log_bridge(f"⚠️ Bridge port {PORT} is occupied. Exiting duplicate instance check.")
        sys.exit(0)
    try:
        bridge_instance = CodeBuilderBridge()
        bridge_instance.start()
        log_bridge(f"✅ Bridge TCP (Port {PORT}) & Web IDE (Port {WEB_PORT}) successfully initialized!")
        while True:
            time.sleep(1)
    except Exception as err:
        log_bridge(f"❌ FATAL ERROR in Bridge Daemon: {err}")
        sys.exit(1)
    except KeyboardInterrupt:
        log_bridge("👋 Stopping Bridge Daemon...")
        if 'bridge_instance' in locals():
            bridge_instance.stop()

