from __future__ import annotations

from pathlib import Path
import sys
from typing import Any

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "frontend"
CATALOGO_PATH = BASE_DIR / "catalogo" / "catalogo.json"
MODELOS_DIR = BASE_DIR / "modelos"
GERADAS_DIR = BASE_DIR / "geradas"

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from decision.decision_engine import DecisionError, encontrar_minuta
from backend.launcher import gerar_copia_e_abrir


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.post("/api/minutas/encontrar")
    def encontrar():
        respostas = _json_body()
        try:
            minuta = encontrar_minuta(respostas, CATALOGO_PATH)
        except DecisionError as exc:
            return jsonify({"erro": str(exc)}), 422

        return jsonify(
            {
                "id": minuta["id"],
                "nome": minuta["nome"],
                "arquivo": minuta["arquivo"],
            }
        )

    @app.post("/api/minutas/gerar")
    def gerar():
        respostas = _json_body()
        try:
            minuta = encontrar_minuta(respostas, CATALOGO_PATH)
            copia = gerar_copia_e_abrir(minuta, MODELOS_DIR, GERADAS_DIR)
        except (DecisionError, FileNotFoundError, OSError) as exc:
            return jsonify({"erro": str(exc)}), 422

        return jsonify(
            {
                "id": minuta["id"],
                "nome": minuta["nome"],
                "arquivo": minuta["arquivo"],
                "copia": str(copia),
            }
        )

    return app


def _json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
