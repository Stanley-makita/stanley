from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CAMPOS_DECISAO = (
    "produto",
    "fgts",
    "interveniente_quitante",
    "banco_iq",
    "tipo_imovel",
    "operacao",
    "sistema",
    "taxa",
)


class DecisionError(Exception):
    pass


def encontrar_minuta(
    respostas: dict[str, Any], catalogo_path: Path
) -> dict[str, Any]:
    catalogo = _carregar_catalogo(catalogo_path)
    _validar_respostas(respostas)

    compativeis = [
        minuta for minuta in catalogo if _minuta_compativel(minuta, respostas)
    ]

    if not compativeis:
        raise DecisionError("Nenhuma minuta compatível foi encontrada.")

    if len(compativeis) > 1:
        nomes = ", ".join(str(item["nome"]) for item in compativeis)
        raise DecisionError(f"Mais de uma minuta compatível foi encontrada: {nomes}.")

    return compativeis[0]


def _carregar_catalogo(catalogo_path: Path) -> list[dict[str, Any]]:
    with catalogo_path.open("r", encoding="utf-8") as arquivo:
        dados = json.load(arquivo)

    if not isinstance(dados, list):
        raise DecisionError("Catálogo inválido.")

    return dados


def _validar_respostas(respostas: dict[str, Any]) -> None:
    faltantes = [campo for campo in CAMPOS_DECISAO if campo not in respostas]
    if faltantes:
        raise DecisionError(f"Respostas incompletas: {', '.join(faltantes)}.")


def _minuta_compativel(
    minuta: dict[str, Any], respostas: dict[str, Any]
) -> bool:
    return all(
        _valor_compativel(minuta.get(campo), respostas.get(campo))
        for campo in CAMPOS_DECISAO
    )


def _valor_compativel(valor_catalogo: Any, valor_resposta: Any) -> bool:
    if isinstance(valor_catalogo, list):
        return valor_resposta in valor_catalogo

    return valor_catalogo == valor_resposta
