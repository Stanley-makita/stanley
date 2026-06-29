from __future__ import annotations

import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any


def gerar_copia_e_abrir(
    minuta: dict[str, Any], modelos_dir: Path, geradas_dir: Path
) -> Path:
    origem = modelos_dir / str(minuta["arquivo"])
    if not origem.exists():
        raise FileNotFoundError(f"Modelo oficial não encontrado: {origem}")

    geradas_dir.mkdir(parents=True, exist_ok=True)
    destino = geradas_dir / _nome_copia(str(minuta["nome"]))
    shutil.copy2(origem, destino)
    _abrir_no_word(destino)
    return destino


def _nome_copia(nome_minuta: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_limpo = "".join(
        caractere if caractere.isalnum() or caractere in (" ", "-", "_") else "_"
        for caractere in nome_minuta
    )
    nome_limpo = "_".join(nome_limpo.split())
    return f"{timestamp}_{nome_limpo}.docx"


def _abrir_no_word(caminho: Path) -> None:
    if os.name == "nt":
        os.startfile(caminho)  # type: ignore[attr-defined]
        return

    subprocess.Popen(["xdg-open", str(caminho)])
