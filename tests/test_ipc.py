#!/usr/bin/env python3
"""
Testa a comunicação IPC com o MPV via Unix Domain Socket.
"""

import json
import os
import socket
import subprocess
import time

def main():
    sock_path = f"/tmp/test_radioviva_{os.getuid()}.sock"
    if os.path.exists(sock_path):
        os.remove(sock_path)

    cmd = [
        "/usr/bin/mpv",
        "--idle=yes",
        "--no-video",
        "--no-terminal",
        f"--input-ipc-server={sock_path}"
    ]
    proc = subprocess.Popen(cmd)

    # Espera socket
    connected = False
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    for _ in range(20):
        if os.path.exists(sock_path):
            try:
                sock.connect(sock_path)
                connected = True
                break
            except Exception:
                pass
        time.sleep(0.1)

    assert connected, "Falha ao conectar ao socket MPV IPC."
    print("[✓] Conexão socket estabelecida.")

    def send_cmd(command):
        req = json.dumps({"command": command, "request_id": 1}) + "\n"
        sock.sendall(req.encode("utf-8"))
        res = sock.recv(2048).decode("utf-8")
        return json.loads(res.strip().split("\n")[0])

    # Teste 1: Versão do MPV
    res = send_cmd(["get_property", "mpv-version"])
    assert res.get("error") == "success", "Erro ao obter mpv-version"
    print(f"[✓] MPV Version: {res.get('data')}")

    # Teste 2: Volume
    res = send_cmd(["set_property", "volume", 65])
    assert res.get("error") == "success", "Erro ao definir volume"
    res = send_cmd(["get_property", "volume"])
    assert abs(res.get("data") - 65) < 0.1, "Volume incorreto"
    print("[✓] Volume alterado e verificado.")

    # Teste 3: Stream Record property
    rec_file = "/tmp/test_rec.mp3"
    res = send_cmd(["set_property", "stream-record", rec_file])
    assert res.get("error") == "success", "Erro ao ativar stream-record"
    res = send_cmd(["set_property", "stream-record", ""])
    assert res.get("error") == "success", "Erro ao desativar stream-record"
    print("[✓] Propriedade de gravação (stream-record) verificada.")

    # Limpeza
    send_cmd(["quit"])
    sock.close()
    proc.wait(timeout=2)
    if os.path.exists(sock_path):
        os.remove(sock_path)
    print("\n[✓] Todos os testes de IPC passaram!")

if __name__ == "__main__":
    main()
