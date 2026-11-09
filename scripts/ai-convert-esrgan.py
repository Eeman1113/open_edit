"""Convert Real-ESRGAN realesr-general-x4v3 (BSD-3-Clause, xinntao/Real-ESRGAN) to ONNX for onnxruntime-web.

Usage (in a venv with torch, onnx, onnxconverter-common):
    python scripts/ai-convert-esrgan.py realesr-general-x4v3.pth public/models

Writes realesr-general-x4v3.fp32.onnx (WASM) and realesr-general-x4v3.fp16.onnx (WebGPU, fp32 I/O).
SRVGGNetCompact is defined here so basicsr isn't needed.
Input: float32 [1,3,H,W] RGB 0..1 (dynamic H/W). Output: float32 [1,3,4H,4W].
"""
import sys, os
import torch
import torch.nn as nn
import torch.nn.functional as F


class SRVGGNetCompact(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type="prelu"):
        super().__init__()
        self.upscale = upscale
        self.body = nn.ModuleList()
        self.body.append(nn.Conv2d(num_in_ch, num_feat, 3, 1, 1))
        self.body.append(nn.PReLU(num_parameters=num_feat))
        for _ in range(num_conv):
            self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1))
            self.body.append(nn.PReLU(num_parameters=num_feat))
        self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.upsampler = nn.PixelShuffle(upscale)

    def forward(self, x):
        out = x
        for layer in self.body:
            out = layer(out)
        out = self.upsampler(out)
        return out + F.interpolate(x, scale_factor=self.upscale, mode="nearest")


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    ck = torch.load(src, map_location="cpu")
    sd = ck.get("params_ema") or ck.get("params") or ck
    net = SRVGGNetCompact()
    net.load_state_dict(sd, strict=True)
    net.eval()
    fp32 = os.path.join(outdir, "realesr-general-x4v3.fp32.onnx")
    x = torch.rand(1, 3, 64, 64)
    torch.onnx.export(net, x, fp32, input_names=["input"], output_names=["output"], opset_version=17,
                      dynamic_axes={"input": {2: "h", 3: "w"}, "output": {2: "H", 3: "W"}}, dynamo=False)
    import onnx
    from onnxconverter_common import float16
    m = onnx.load(fp32)
    m16 = float16.convert_float_to_float16(m, keep_io_types=True)
    onnx.save(m16, os.path.join(outdir, "realesr-general-x4v3.fp16.onnx"))
    # sanity check against torch
    import onnxruntime as ort, numpy as np
    ref = net(x).detach().numpy()
    for f in ("fp32", "fp16"):
        s = ort.InferenceSession(os.path.join(outdir, f"realesr-general-x4v3.{f}.onnx"))
        y = s.run(None, {"input": x.numpy()})[0]
        print(f, y.shape, "max abs diff", float(np.abs(y - ref).max()))


if __name__ == "__main__":
    main()
