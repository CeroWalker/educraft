#!/usr/bin/env python3
"""
CraftForge Education Edition - Full Education & Agent Code Builder Bridge Daemon + Visual Blockly Web IDE Server
Provides:
 1. Education Code Builder TCP Server (Port 4711) for game client & IPC
 2. In-Game Mod Web Overlay HTTP Server (Port 8080) with Google Blockly Visual Scratch & Python Coding
 3. Custom Agent & Minecraft Blockly Blocks with real-time Python code generation
 4. AST-based Restricted Python Sandbox for executing player scripts safely
 5. AST-based Function Call Parser & RAM Telemetry Cache
"""
import sys
import time
import json
import socket
import threading
import os
import ast
from http.server import HTTPServer, BaseHTTPRequestHandler

HOST = '127.0.0.1'
PORT = 4711
WEB_PORT = 8080

agent_state = {
    "spawned": False,
    "x": 0, "y": 64, "z": 0,
    "direction": "forward"
}

IN_MEMORY_BLOCK_CACHE = {
    "forward": "air",
    "down": "air",
    "up": "air"
}

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CraftForge Education - Code Builder IDE</title>
    <!-- Google Blockly Library CDN -->
    <script src="https://unpkg.com/blockly@10.4.3/blockly_compressed.js"></script>
    <script src="https://unpkg.com/blockly@10.4.3/blocks_compressed.js"></script>
    <script src="https://unpkg.com/blockly@10.4.3/python_compressed.js"></script>
    <script src="https://unpkg.com/blockly@10.4.3/msg/tr.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        body { 
            background: rgba(15, 23, 42, 0.94); 
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
            background: rgba(30, 41, 59, 0.85); 
            padding: 8px 16px; 
            border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            -webkit-app-region: drag;
        }
        .logo { font-size: 0.95rem; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
        .tabs { display: flex; gap: 8px; -webkit-app-region: no-drag; }
        .tab-btn { background: rgba(51, 65, 85, 0.6); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1); padding: 6px 16px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; }
        .tab-btn.active { background: #3b82f6; color: white; border-color: #60a5fa; }
        .tab-btn:hover:not(.active) { background: rgba(71, 85, 105, 0.8); color: #f8fafc; }
        .status { font-size: 0.75rem; background: rgba(6, 78, 59, 0.8); color: #34d399; padding: 4px 12px; border-radius: 9999px; font-weight: 600; border: 1px solid #059669; }

        main { display: flex; flex-direction: column; flex: 1; overflow: hidden; padding: 12px; gap: 12px; }
        
        .tab-content { display: none; flex: 1; flex-direction: column; min-height: 0; }
        .tab-content.active { display: flex; }

        #blocklyContainer { flex: 1; min-height: 0; display: flex; flex-direction: column; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; }
        #blocklyDiv { width: 100%; height: 100%; }

        .editor-container { display: flex; flex-direction: column; flex: 1; min-height: 0; background: rgba(9, 13, 22, 0.85); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; }
        textarea { flex: 1; background: transparent; color: #38bdf8; font-family: 'Consolas', 'Courier New', monospace; font-size: 0.9rem; padding: 16px; border: none; resize: none; outline: none; line-height: 1.5; }
        
        .action-bar { background: rgba(30, 41, 59, 0.8); padding: 8px 16px; border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; gap: 8px; }
        .btn { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; -webkit-app-region: no-drag; }
        .btn:hover { background: #2563eb; transform: translateY(-1px); }
        .btn-success { background: #10b981; }
        .btn-success:hover { background: #059669; }
        
        .console { background: rgba(2, 6, 23, 0.95); border-top: 1px solid rgba(255, 255, 255, 0.1); height: 90px; padding: 8px 16px; font-family: monospace; font-size: 0.75rem; color: #a7f3d0; overflow-y: auto; }
        
        /* Blockly Dark Theme Customization */
        .blocklyTreeLabel { color: #f8fafc !important; font-weight: 600; }
        .blocklyFlyoutBackground { fill: #1e293b !important; fill-opacity: 0.9; }
        .blocklyMainBackground { fill: #0f172a !important; }
    </style>
</head>
<body>
    <header>
        <div class="logo">🎓 CraftForge Edu Code Builder</div>
        <div class="tabs">
            <button class="tab-btn active" onclick="switchTab('blocks')">🧩 Görsel Bloklar (Scratch)</button>
            <button class="tab-btn" onclick="switchTab('python')">🐍 Python Kodu</button>
        </div>
        <div class="status">🟢 Aktif (N Kapatır)</div>
    </header>
    <main>
        <!-- TAB 1: BLOCKLY VISUAL SCRATCH CODING -->
        <div id="tab-blocks" class="tab-content active">
            <div id="blocklyContainer">
                <div id="blocklyDiv"></div>
            </div>
            <div class="action-bar">
                <button class="btn btn-success" style="flex: 2;" onclick="runBlocklyScript()">▶️ Görsel Kodu Oyunda Çalıştır</button>
                <button class="btn" style="background: #8b5cf6;" onclick="runCmd('agent.spawn()')">✨ Agent Çağır</button>
                <button class="btn" style="background: #475569;" onclick="workspace.clear()">🧹 Blokları Temizle</button>
            </div>
        </div>

        <!-- TAB 2: RAW PYTHON TEXT CODE EDITOR -->
        <div id="tab-python" class="tab-content">
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
                    <button class="btn btn-success" style="flex: 2;" onclick="executePythonScript()">▶️ Python Kodunu Çalıştır</button>
                    <button class="btn" style="background: #475569;" onclick="document.getElementById('codeEditor').value=''">🧹 Temizle</button>
                </div>
            </div>
        </div>

        <!-- SHARED CONSOLE OUTPUT -->
        <div class="console" id="console">💻 Görsel Scratch & Python IDE Hazır. (N tuşu paneli açar/kapatır)\n</div>
    </main>

    <!-- BLOCKLY TOOLBOX & BLOCK DEFINITIONS -->
    <xml id="toolbox" style="display: none">
        <category name="🤖 Agent Robot" colour="#10b981">
            <block type="agent_spawn"></block>
            <block type="agent_move"></block>
            <block type="agent_turn"></block>
            <block type="agent_place"></block>
            <block type="agent_destroy"></block>
            <block type="agent_detect"></block>
        </category>
        <category name="💬 Oyuncu & Dünya" colour="#3b82f6">
            <block type="player_say"></block>
            <block type="world_setblock"></block>
            <block type="chemistry_element"></block>
        </category>
        <category name="🔄 Döngüler" colour="#8b5cf6">
            <block type="controls_repeat_ext">
                <value name="TIMES">
                    <shadow type="math_number"><field name="NUM">3</field></shadow>
                </value>
            </block>
            <block type="controls_whileUntil"></block>
        </category>
        <category name="🔀 Mantık & Karar" colour="#f59e0b">
            <block type="controls_if"></block>
            <block type="logic_compare"></block>
            <block type="logic_boolean"></block>
        </category>
        <category name="🔢 Matematik" colour="#ec4899">
            <block type="math_number"><field name="NUM">1</field></block>
            <block type="math_arithmetic"></block>
        </category>
        <category name="📝 Metin" colour="#06b6d4">
            <block type="text"><field name="TEXT">Merhaba Minecraft!</field></block>
        </category>
    </xml>

    <script>
        function log(msg) {
            const c = document.getElementById('console');
            c.innerText += msg + '\\n';
            c.scrollTop = c.scrollHeight;
        }

        function switchTab(tab) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            if (tab === 'blocks') {
                document.querySelectorAll('.tab-btn')[0].classList.add('active');
                document.getElementById('tab-blocks').classList.add('active');
                Blockly.svgResize(workspace);
            } else {
                document.querySelectorAll('.tab-btn')[1].classList.add('active');
                document.getElementById('tab-python').classList.add('active');
                // Sync Blockly generated code to Python editor
                if (typeof Blockly !== 'undefined' && workspace) {
                    const pyCode = python.pythonGenerator.workspaceToCode(workspace);
                    if (pyCode.trim()) {
                        document.getElementById('codeEditor').value = pyCode;
                    }
                }
            }
        }

        // --- CUSTOM CRAFTFORGE BLOCKLY BLOCKS ---
        Blockly.Blocks['agent_spawn'] = {
            init: function() {
                this.appendDummyInput().appendField("✨ Agent Robot Çağır / Işınla");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(160);
                this.setTooltip("Agent robotu oyuncunun yanına ışınlar.");
            }
        };
        python.pythonGenerator.forBlock['agent_spawn'] = function(block) {
            return 'agent.spawn()\\n';
        };

        Blockly.Blocks['agent_move'] = {
            init: function() {
                this.appendDummyInput()
                    .appendField("⬆️ Agent")
                    .appendField(new Blockly.FieldDropdown([["İleri","forward"], ["Geri","back"], ["Sol","left"], ["Sağ","right"], ["Yukarı","up"], ["Aşağı","down"]]), "DIR")
                    .appendField("yönüne")
                    .appendField(new Blockly.FieldNumber(1, 1, 100), "STEPS")
                    .appendField("adım git");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(160);
            }
        };
        python.pythonGenerator.forBlock['agent_move'] = function(block) {
            const dir = block.getFieldValue('DIR');
            const steps = block.getFieldValue('STEPS');
            return `agent.move("${dir}", ${steps})\\n`;
        };

        Blockly.Blocks['agent_turn'] = {
            init: function() {
                this.appendDummyInput()
                    .appendField("🔄 Agent")
                    .appendField(new Blockly.FieldDropdown([["Sağa","right"], ["Sola","left"], ["Geriye","back"]]), "DIR")
                    .appendField("Dön");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(160);
            }
        };
        python.pythonGenerator.forBlock['agent_turn'] = function(block) {
            const dir = block.getFieldValue('DIR');
            return `agent.turn("${dir}")\\n`;
        };

        Blockly.Blocks['agent_place'] = {
            init: function() {
                this.appendDummyInput()
                    .appendField("🧱 Agent")
                    .appendField(new Blockly.FieldDropdown([["Öne","forward"], ["Aşağıya","down"], ["Yukarıya","up"], ["Sola","left"], ["Sağa","right"]]), "DIR")
                    .appendField(new Blockly.FieldDropdown([["Taş (Stone)","stone"], ["Çimen (Grass)","grass_block"], ["Tahta (Planks)","oak_planks"], ["Cam (Glass)","glass"], ["Elmas Blok","diamond_block"]]), "BLOCK")
                    .appendField("Koy");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(160);
            }
        };
        python.pythonGenerator.forBlock['agent_place'] = function(block) {
            const dir = block.getFieldValue('DIR');
            const b = block.getFieldValue('BLOCK');
            return `agent.place("${dir}", "${b}")\\n`;
        };

        Blockly.Blocks['agent_destroy'] = {
            init: function() {
                this.appendDummyInput()
                    .appendField("⛏️ Agent")
                    .appendField(new Blockly.FieldDropdown([["Önündeki","forward"], ["Aşağısındaki","down"], ["Yukarısındaki","up"]]), "DIR")
                    .appendField("Bloku Kır");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(160);
            }
        };
        python.pythonGenerator.forBlock['agent_destroy'] = function(block) {
            const dir = block.getFieldValue('DIR');
            return `agent.destroy("${dir}")\\n`;
        };

        Blockly.Blocks['agent_detect'] = {
            init: function() {
                this.appendDummyInput()
                    .appendField("🔍 Agent")
                    .appendField(new Blockly.FieldDropdown([["Önündeki","forward"], ["Aşağısındaki","down"], ["Yukarısındaki","up"]]), "DIR")
                    .appendField("Blok Türü");
                this.setOutput(true, "String");
                this.setColour(160);
            }
        };
        python.pythonGenerator.forBlock['agent_detect'] = function(block) {
            const dir = block.getFieldValue('DIR');
            return [`agent.detect("${dir}")`, python.pythonGenerator.ORDER_ATOMIC];
        };

        Blockly.Blocks['player_say'] = {
            init: function() {
                this.appendValueInput("MSG")
                    .setCheck("String")
                    .appendField("💬 Oyuncu Mesajı Gönder");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(210);
            }
        };
        python.pythonGenerator.forBlock['player_say'] = function(block) {
            const msg = python.pythonGenerator.valueToCode(block, 'MSG', python.pythonGenerator.ORDER_ATOMIC) || '""';
            return `player.say(${msg})\\n`;
        };

        Blockly.Blocks['world_setblock'] = {
            init: function() {
                this.appendDummyInput()
                    .appendField("🌍 Blok Koy X:")
                    .appendField(new Blockly.FieldNumber(0), "X")
                    .appendField("Y:")
                    .appendField(new Blockly.FieldNumber(64), "Y")
                    .appendField("Z:")
                    .appendField(new Blockly.FieldNumber(0), "Z")
                    .appendField(new Blockly.FieldDropdown([["Taş","stone"], ["Çimen","grass_block"], ["Altın Blok","gold_block"]]), "BLOCK");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(210);
            }
        };
        python.pythonGenerator.forBlock['world_setblock'] = function(block) {
            const x = block.getFieldValue('X');
            const y = block.getFieldValue('Y');
            const z = block.getFieldValue('Z');
            const b = block.getFieldValue('BLOCK');
            return `world.setBlock(${x}, ${y}, ${z}, "${b}")\\n`;
        };

        Blockly.Blocks['chemistry_element'] = {
            init: function() {
                this.appendDummyInput()
                    .appendField("🧪 Kimya Elementi Ver:")
                    .appendField(new Blockly.FieldDropdown([["Hidrojen (H)","Hydrogen"], ["Oksijen (O)","Oxygen"], ["Karbon (C)","Carbon"], ["Helyum (He)","Helium"]]), "ELEM");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(280);
            }
        };
        python.pythonGenerator.forBlock['chemistry_element'] = function(block) {
            const elem = block.getFieldValue('ELEM');
            return `chemistry.giveElement("${elem}")\\n`;
        };

        // --- INITIALIZE BLOCKLY WORKSPACE ---
        let workspace = null;
        window.addEventListener('DOMContentLoaded', () => {
            workspace = Blockly.inject('blocklyDiv', {
                toolbox: document.getElementById('toolbox'),
                scrollbars: true,
                trashcan: true,
                zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3 }
            });
            window.addEventListener('resize', () => Blockly.svgResize(workspace));
        });

        function runCmd(cmd) {
            log('⚡ ' + cmd);
            fetch('/api/run', { method: 'POST', body: cmd })
                .then(r => r.text())
                .then(res => log('✅ ' + res))
                .catch(err => log('❌ ' + err));
        }

        function runBlocklyScript() {
            const pyCode = python.pythonGenerator.workspaceToCode(workspace);
            if (!pyCode.trim()) {
                log('⚠️ Hiç blok eklenmedi!');
                return;
            }
            log('🚀 Görsel Blok Kodları Çalıştırılıyor...');
            log('📝 Üretilen Python Kodu:\\n' + pyCode);
            fetch('/api/run', { method: 'POST', body: pyCode })
                .then(r => r.text())
                .then(res => log('🎉 ' + res))
                .catch(err => log('❌ Hata: ' + err));
        }

        function executePythonScript() {
            const code = document.getElementById('codeEditor').value;
            log('🚀 Python Script Çalıştırılıyor...');
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
    if any(val != "air" for val in IN_MEMORY_BLOCK_CACHE.values()):
        return IN_MEMORY_BLOCK_CACHE.copy()

    blocks_file = os.path.join(get_data_dir(), "edu_blocks.json")
    try:
        if os.path.exists(blocks_file):
            with open(blocks_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                IN_MEMORY_BLOCK_CACHE.update(data)
                return data
    except Exception:
        pass
    return IN_MEMORY_BLOCK_CACHE.copy()

execution_state = {
    "cancelled": False,
    "current_token": 0,
    "active_thread": None
}

def stop_current_execution():
    execution_state["cancelled"] = True
    execution_state["current_token"] += 1


class SecurityVisitor(ast.NodeVisitor):
    FORBIDDEN_NAMES = {'open', 'eval', 'exec', 'compile', '__import__', 'globals', 'locals', 'getattr', 'setattr', 'delattr', 'system', 'popen'}

    def __init__(self):
        self.errors = []

    def visit_Import(self, node):
        self.errors.append("Import ifadelerine izin verilmiyor.")
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        self.errors.append("ImportFrom ifadelerine izin verilmiyor.")
        self.generic_visit(node)

    def visit_Name(self, node):
        if node.id in self.FORBIDDEN_NAMES:
            self.errors.append(f"Yasaklı keyword/fonksiyon: '{node.id}'")
        self.generic_visit(node)


def parse_command_ast(cmd_str):
    try:
        tree = ast.parse(cmd_str.strip(), mode='eval')
        if isinstance(tree.body, ast.Call) and isinstance(tree.body.func, ast.Attribute):
            attr_node = tree.body.func
            target = attr_node.value.id if isinstance(attr_node.value, ast.Name) else None
            func_name = attr_node.attr
            args = [ast.literal_eval(arg) for arg in tree.body.args]
            kwargs = {kw.arg: ast.literal_eval(kw.value) for kw in tree.body.keywords}
            return target, func_name, args, kwargs
    except Exception:
        pass
    return None


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


def execute_script_safely(code):
    stop_current_execution()
    time.sleep(0.02)
    execution_state["cancelled"] = False
    my_token = execution_state["current_token"]
    start_time = time.time()
    step_counter = [0]

    def check_guard():
        if execution_state["cancelled"] or execution_state["current_token"] != my_token:
            raise RuntimeError("🛑 Çalışan kod durduruldu.")
        if time.time() - start_time > 15.0:
            raise RuntimeError("⚠️ Zaman aşımı! Kod 15 saniyeden uzun sürdüğü için durduruldu.")

    def tracer(frame, event, arg):
        check_guard()
        if event == 'line':
            step_counter[0] += 1
            if step_counter[0] > 2000:
                raise RuntimeError("⚠️ Maksimum 2000 adım sınırı aşıldı.")
        return tracer

    try:
        tree = ast.parse(code, mode='exec')
    except SyntaxError as se:
        err_msg = f"❌ Syntax Error (Line {se.lineno}): {se.msg}"
        PlayerAPI().say(err_msg)
        return err_msg

    visitor = SecurityVisitor()
    visitor.visit(tree)
    if visitor.errors:
        err_msg = f"🛑 Güvenlik İhlali: {'; '.join(visitor.errors)}"
        PlayerAPI().say(err_msg)
        return err_msg

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
        compiled_code = compile(tree, filename="<edu_script>", mode="exec")
        sys.settrace(tracer)
        exec(compiled_code, scope)
        sys.settrace(None)
        res = "🎉 Script başarıyla çalıştırıldı!"
    except RuntimeError as re:
        sys.settrace(None)
        res = str(re)
        PlayerAPI().say(str(re).replace('🛑 ', '').replace('⚠️ ', ''))
    except Exception as e:
        sys.settrace(None)
        res = f"❌ Python Hatası: {e}"
        PlayerAPI().say(f"Python Hatası: {e}")

    return res


class WebIDEHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/trigger_overlay':
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
            res = execute_script_safely(code)
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(res.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return


class CodeBuilderBridge:
    def __init__(self, host=HOST, port=PORT):
        self.host = host
        self.port = port
        self.running = False
        self.sock = None
        self.clients = set()
        self.lock = threading.Lock()

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
            self.sock.listen(10)
            print(f"🎓 [CraftForge Edu] Agent TCP Server -> {self.host}:{self.port}")
        except Exception as e:
            print(f"⚠️ [CraftForge Edu] TCP Server Error: {e}")

        # Start In-Game Web Overlay Server on Port 8080
        def run_web():
            try:
                class ReuseHTTPServer(HTTPServer):
                    allow_reuse_address = True
                server = ReuseHTTPServer((HOST, WEB_PORT), WebIDEHandler)
                print(f"🌐 [CraftForge Edu] In-Game Web Overlay Server -> http://{HOST}:{WEB_PORT}")
                server.serve_forever()
            except Exception as e:
                print(f"⚠️ Web IDE Server Error: {e}")

        threading.Thread(target=run_web, daemon=True).start()
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def _accept_loop(self):
        while self.running:
            try:
                conn, addr = self.sock.accept()
                with self.lock:
                    self.clients.add(conn)
                threading.Thread(target=self._handle_client, args=(conn, addr), daemon=True).start()
            except Exception:
                break

    def _handle_client(self, conn, addr):
        buffer = ""
        try:
            while self.running:
                data = conn.recv(4096)
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
        except Exception:
            pass
        finally:
            with self.lock:
                self.clients.discard(conn)
            try:
                conn.close()
            except Exception:
                pass

    def _process_command(self, cmd):
        print(f"💻 [Edu Command]: {cmd}")
        
        # 1. JSON Payload Parsing
        if cmd.startswith("{") and cmd.endswith("}"):
            try:
                payload = json.loads(cmd)
                action = payload.get("action") or payload.get("type")
                if action in ("run", "script", "execute"):
                    code = payload.get("code", "")
                    return execute_script_safely(code)
                elif action == "stop":
                    stop_current_execution()
                    return "OK: Execution Stopped"
                elif action == "update_blocks":
                    blocks = payload.get("blocks", {})
                    IN_MEMORY_BLOCK_CACHE.update(blocks)
                    return "OK: Block cache updated in RAM"
                elif "cmd" in payload:
                    cmd = payload["cmd"]
            except Exception as e:
                return f"❌ Invalid JSON Payload: {e}"

        if cmd.startswith("run_script:"):
            code = cmd[11:]
            return execute_script_safely(code)

        # 2. AST-Based Function Call Parsing
        parsed = parse_command_ast(cmd)
        if parsed:
            target, func_name, args, kwargs = parsed

            if target == 'agent':
                if func_name == 'spawn':
                    summon_cmd = 'execute at @p rotated ~ 0 unless entity @e[tag=agent_robot] run summon iron_golem ^ ^0 ^2 {CustomName:\'"Agent Robot"\',CustomNameVisible:1b,NoAI:1b,Invulnerable:1b,Tags:["agent_robot"],attributes:[{id:"minecraft:scale",base:0.5}]}'
                    tp_cmd = 'execute at @p rotated ~ 0 run tp @e[tag=agent_robot,limit=1] ^ ^0 ^2'
                    scale_cmd = 'attribute @e[tag=agent_robot,limit=1] minecraft:scale base set 0.5'
                    self._dispatch_mc_command(summon_cmd)
                    self._dispatch_mc_command(tp_cmd)
                    self._dispatch_mc_command(scale_cmd)
                    return "OK: Agent Teleported / Spawned"

                elif func_name in ('turn', 'look'):
                    dir_arg = str(args[0]).lower() if args else str(kwargs.get('direction', 'right')).lower()
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
                    return f"OK: Agent turned {dir_arg}"

                elif func_name == 'move':
                    direction = str(args[0]) if len(args) > 0 else str(kwargs.get('direction', 'forward'))
                    steps = int(args[1]) if len(args) > 1 else int(kwargs.get('steps', 1))
                    lr = steps if direction == 'right' else (-steps if direction == 'left' else 0)
                    ud = steps if direction == 'up' else (-steps if direction == 'down' else 0)
                    fb = steps if direction == 'forward' else (-steps if direction == 'back' else 0)
                    mc_cmd = f'execute as @e[tag=agent_robot,limit=1] at @s run tp @s ^{lr} ^{ud} ^{fb}'
                    self._dispatch_mc_command(mc_cmd)
                    return f"OK: Agent moved {direction} by {steps}"

                elif func_name == 'place':
                    direction = str(args[0]).lower() if len(args) > 0 else str(kwargs.get('direction', 'forward')).lower()
                    block = str(args[1]).replace('minecraft:', '') if len(args) > 1 else str(kwargs.get('block', 'stone')).replace('minecraft:', '')
                    offsets = {
                        "down": "^ ^-1 ^", "below": "^ ^-1 ^", "bottom": "^ ^-1 ^",
                        "up": "^ ^1 ^", "above": "^ ^1 ^", "top": "^ ^1 ^",
                        "back": "^ ^0 ^-1", "behind": "^ ^0 ^-1",
                        "left": "^-1 ^0 ^", "west": "^-1 ^0 ^",
                        "right": "^1 ^0 ^", "east": "^1 ^0 ^"
                    }
                    offset = offsets.get(direction, "^ ^0 ^1")
                    mc_cmd = f'execute at @e[tag=agent_robot,limit=1] run setblock {offset} minecraft:{block}'
                    self._dispatch_mc_command(mc_cmd)
                    return f"OK: Agent placed {block} {direction}"

                elif func_name in ('destroy', 'break', 'break_block'):
                    direction = str(args[0]).lower() if len(args) > 0 else str(kwargs.get('direction', 'forward')).lower()
                    offsets = {
                        "down": "^ ^-1 ^", "below": "^ ^-1 ^", "bottom": "^ ^-1 ^",
                        "up": "^ ^1 ^", "above": "^ ^1 ^", "top": "^ ^1 ^",
                        "back": "^ ^0 ^-1", "behind": "^ ^0 ^-1",
                        "left": "^-1 ^0 ^", "west": "^-1 ^0 ^",
                        "right": "^1 ^0 ^", "east": "^1 ^0 ^"
                    }
                    offset = offsets.get(direction, "^ ^0 ^1")
                    mc_cmd = f'execute at @e[tag=agent_robot,limit=1] run setblock {offset} minecraft:air destroy'
                    self._dispatch_mc_command(mc_cmd)
                    return f"OK: Agent destroyed block {direction}"

            elif target == 'world' and func_name == 'setBlock':
                if len(args) >= 4:
                    x, y, z, block = args[0], args[1], args[2], str(args[3]).replace('minecraft:', '')
                    mc_cmd = f"execute at @p run setblock {x} {y} {z} minecraft:{block}"
                    self._dispatch_mc_command(mc_cmd)
                    return "OK: Block placed in world"

            elif target == 'chemistry' and func_name == 'giveElement':
                if args:
                    element = str(args[0])
                    mc_cmd = f'give @p minecraft:glowstone_dust[custom_name=\'{"text":"Element: {element}"}\'] 64'
                    self._dispatch_mc_command(mc_cmd)
                    return "OK: Chemistry Element Given"

            elif target == 'player' and func_name == 'say':
                if args:
                    msg = str(args[0])
                    mc_cmd = f"say [Edu Script] {msg}"
                    self._dispatch_mc_command(mc_cmd)
                    return "OK"

        # Direct string fallback (e.g. agent.spawn)
        if cmd.startswith("agent.spawn"):
            summon_cmd = 'execute at @p rotated ~ 0 unless entity @e[tag=agent_robot] run summon iron_golem ^ ^0 ^2 {CustomName:\'"Agent Robot"\',CustomNameVisible:1b,NoAI:1b,Invulnerable:1b,Tags:["agent_robot"],attributes:[{id:"minecraft:scale",base:0.5}]}'
            tp_cmd = 'execute at @p rotated ~ 0 run tp @e[tag=agent_robot,limit=1] ^ ^0 ^2'
            scale_cmd = 'attribute @e[tag=agent_robot,limit=1] minecraft:scale base set 0.5'
            self._dispatch_mc_command(summon_cmd)
            self._dispatch_mc_command(tp_cmd)
            self._dispatch_mc_command(scale_cmd)
            return "OK: Agent Teleported / Spawned"

        return "OK"

    def _dispatch_mc_command(self, mc_cmd):
        print(f"⚡ [Minecraft Command Dispatch]: /{mc_cmd}")
        
        # 1. Direct Socket Broadcast to connected game clients
        msg_bytes = (mc_cmd + "\n").encode('utf-8')
        with self.lock:
            to_remove = set()
            for c in self.clients:
                try:
                    c.sendall(msg_bytes)
                except Exception:
                    to_remove.add(c)
            self.clients -= to_remove

        # 2. File append fallback for legacy IPC
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
        log_bridge(f"✅ Bridge TCP (Port {PORT}) & Visual Blockly Overlay (Port {WEB_PORT}) successfully initialized!")
        while True:
            time.sleep(1)
    except Exception as err:
        log_bridge(f"❌ FATAL ERROR in Bridge Daemon: {err}")
        sys.exit(1)
    except KeyboardInterrupt:
        log_bridge("👋 Stopping Bridge Daemon...")
