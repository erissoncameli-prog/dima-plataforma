#!/usr/bin/env bash
# Baixa o Kokoro-82M (ONNX) e as vozes pt-BR usadas na locução. Uso: ./baixar_modelos.sh <pasta>
set -euo pipefail
D="${1:?informe a pasta dos modelos}"; mkdir -p "$D"; H=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main
curl -fsSL -o "$D/kokoro-v1.0.onnx" "$H/onnx/model.onnx"
for v in pf_dora pm_alex; do curl -fsSL -o "$D/$v.bin" "$H/voices/$v.bin"; done
echo "ok: $D"
