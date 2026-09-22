#!/usr/bin/env python3
"""Extrai grupos/Pokémon de um outerHTML do Codex para JSON.

Uso:
  python scripts/extract_codex.py /caminho/codex.txt lib/kanto-extracted.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup

COLORS = {
    "Velocidade": "#16d7ff",
    "Ataque": "#ff4e55",
    "Atq. Especial": "#ca68ff",
    "Defesa": "#3eb9ff",
    "HP": "#26d978",
    "Def. Especial": "#f2b72f",
}
SHORTS = {
    "Velocidade": "SPD",
    "Ataque": "ATK",
    "Atq. Especial": "SATK",
    "Defesa": "DEF",
    "HP": "HP",
    "Def. Especial": "SDEF",
}
RANK = {"Incomum": 1, "Rara": 2, "Épica": 3, "Lendária": 4}


def extract(html: str):
    soup = BeautifulSoup(html, "html.parser")
    groups = []
    for row in soup.select(".cx-row"):
        match = re.search(r"grupo\s+(\d+)\s+—\s+(.+)$", row.get("title", ""), re.I)
        if not match:
            continue
        group_id = int(match.group(1))
        attribute = match.group(2).strip()
        bonus_text = row.select_one(".cx-row__v")
        bonus_match = re.search(r"\+([0-9,.]+)", bonus_text.get_text(" ", strip=True) if bonus_text else "")
        bonus = float(bonus_match.group(1).replace(",", ".")) if bonus_match else 0.0

        pokemon = []
        for card in row.select(".cx-card"):
            image = card.select_one("img")
            if not image:
                continue
            sprite_match = re.search(r"/sprites/(\d+)\.png", image.get("src", ""))
            if not sprite_match:
                continue
            title = card.get("title", "")
            level = 0
            for label, rank in RANK.items():
                if re.search(rf"—\s*{re.escape(label)}(?:\s|·|$)", title):
                    level = rank
            pokemon.append({
                "id": int(sprite_match.group(1)),
                "name": image.get("alt", "").strip(),
                "codex": {
                    "uncommon": level >= 1,
                    "rare": level >= 2,
                    "epic": level >= 3,
                    "legendary": level >= 4,
                },
            })

        groups.append({
            "id": group_id,
            "attribute": attribute,
            "short": SHORTS[attribute],
            "color": COLORS[attribute],
            "bonus": bonus,
            "pokemon": pokemon,
        })
    return groups


def main():
    if len(sys.argv) != 3:
        raise SystemExit("uso: extract_codex.py INPUT.txt OUTPUT.json")
    src, dst = map(Path, sys.argv[1:])
    groups = extract(src.read_text(encoding="utf-8"))
    dst.write_text(json.dumps(groups, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    slots = sum(len(group["pokemon"]) for group in groups)
    print(f"extraídos {len(groups)} grupos, {slots} slots e {slots * 4} registros de raridade")


if __name__ == "__main__":
    main()
