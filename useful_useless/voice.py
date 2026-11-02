"""离线中文 TTS：Baker 数据集训练的 FastSpeech2 + MB-MelGAN（TFLite 模型）。

模型文件取自 PyPI 包 zhtts 0.0.1 的 zhtts/asset 目录（fastspeech2_quan.tflite / mb_melgan.tflite /
baker_mapper.json），只用模型文件，汉字→拼音→音素的前端是这里自己实现的。

原模型里有两个 FlexRandomUniform 算子（推理时仍开启的 dropout），普通 TFLite 运行时不支持。
patch_model() 把它们换成 TFLite 内置的 RANDOM_UNIFORM 算子，语义不变，换完就不再依赖 Flex。

依赖：pip install ai-edge-litert pypinyin numpy scipy
     （首次修补模型需要 tensorflow-cpu：python3 voice.py patch <asset_dir>）
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
from pypinyin import Style, lazy_pinyin

SR = 24000
PATCHED = "fastspeech2_builtin.tflite"


def patch_model(asset_dir):
    from tensorflow.lite.python import schema_py_generated as s
    from tensorflow.lite.tools import flatbuffer_utils as fu

    asset_dir = Path(asset_dir)
    m = fu.read_model(str(asset_dir / "fastspeech2_quan.tflite"))
    idx = None
    for i, c in enumerate(m.operatorCodes):
        if c.customCode and c.customCode.decode() == "FlexRandomUniform":
            c.customCode = None
            c.builtinCode = s.BuiltinOperator.RANDOM_UNIFORM
            c.deprecatedBuiltinCode = 127  # PLACEHOLDER_FOR_GREATER_OP_CODES
            c.version = 1
            idx = i
    for op in m.subgraphs[0].operators:
        if op.opcodeIndex == idx:
            op.customOptions = None
            op.builtinOptionsType = s.BuiltinOptions.RandomOptions
            op.builtinOptions = s.RandomOptionsT()
    fu.write_model(m, str(asset_dir / PATCHED))


class Voice:
    def __init__(self, asset_dir):
        from ai_edge_litert.interpreter import Interpreter

        asset_dir = Path(asset_dir)
        m = json.loads((asset_dir / "baker_mapper.json").read_text(encoding="utf-8"))
        self.sym = m["symbol_to_id"]
        self.pinyin_dict = m["pinyin_dict"]
        self.eos = self.sym["eos"]
        self.am = Interpreter(model_path=str(asset_dir / PATCHED))
        self.voc = Interpreter(model_path=str(asset_dir / "mb_melgan.tflite"))

    def phonemes(self, text):
        chars = [c for c in text if "一" <= c <= "龥"]
        pys = lazy_pinyin("".join(chars), style=Style.TONE3, neutral_tone_with_five=True)
        out = ["sil"]
        for i, py in enumerate(pys):
            tone, base = py[-1], py[:-1]
            if base == "n":
                base = "en"
            if base not in self.pinyin_dict and base.endswith("r") and base[:-1] in self.pinyin_dict:
                a1, a2 = self.pinyin_dict[base[:-1]]
                out += [a1, a2 + tone, "er5"]
            else:
                a1, a2 = self.pinyin_dict[base]
                out += [a1, a2 + tone]
            if i < len(pys) - 1:
                out.append("#0")
        out.append("sil")
        return out

    def _clause(self, text, speed):
        ids = [self.sym[p] for p in self.phonemes(text)] + [self.eos]
        det = self.am.get_input_details()
        self.am.resize_tensor_input(det[0]["index"], [1, len(ids)])
        self.am.allocate_tensors()
        vals = [np.array([ids], np.int32), np.array([0], np.int32), np.array([speed], np.float32),
                np.array([1.0], np.float32), np.array([1.0], np.float32)]
        for d, v in zip(det, vals):
            self.am.set_tensor(d["index"], v)
        self.am.invoke()
        mel = self.am.get_tensor(self.am.get_output_details()[1]["index"])
        vd = self.voc.get_input_details()
        self.voc.resize_tensor_input(vd[0]["index"], mel.shape)
        self.voc.allocate_tensors()
        self.voc.set_tensor(vd[0]["index"], mel)
        self.voc.invoke()
        return self.voc.get_tensor(self.voc.get_output_details()[0]["index"])[0, :, 0]

    def say(self, text, speed=1.0, pause=0.18):
        """按标点切成短句分别合成，句间插入停顿。speed<1 语速更快。"""
        parts = [p for p in re.split(r"[，。！？、；：,.!?…\s]+", text) if p]
        sil = np.zeros(int(pause * SR), np.float32)
        audio = []
        for i, p in enumerate(parts):
            audio.append(self._clause(p, speed))
            if i < len(parts) - 1:
                audio.append(sil)
        return np.concatenate(audio)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "patch":
        patch_model(sys.argv[2])
        print("patched ->", Path(sys.argv[2]) / PATCHED)
