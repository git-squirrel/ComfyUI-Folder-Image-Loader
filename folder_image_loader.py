"""
📁 文件夹顺序图片加载器（每次一张）

与 ComfyUI LoadImage 完全一致的加载逻辑：
  - IMAGE: (1, H, W, 3) RGB
  - MASK:  (1, H, W) 反转alpha (1=透明, 0=不透明)

工作方式：
  - 每次 Queue Prompt 加载一张图片
  - 内部自动记录已处理到第几张
  - 一张处理完 → 下一张 → ... → 全部处理完自动回到第一张
  - 节点内置"确认扫描"按钮 + 进度信息面板（无连接点）
"""

import os
import torch
import numpy as np
from PIL import Image, ImageOps, ImageSequence
import re
from server import PromptServer
from aiohttp import web

# ============================================================================
# 全局状态
# ============================================================================
_FOLDER_ITERATORS = {}
_RESET_STATE = {}

_api_registered = False


def _natural_sort_key(s):
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', s)]


def _get_image_files(folder_path):
    if not os.path.isdir(folder_path):
        return []
    ext_set = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}
    files = []
    for fname in os.listdir(folder_path):
        if os.path.splitext(fname)[1].lower() in ext_set:
            files.append(fname)
    files.sort(key=_natural_sort_key)
    return files


def _load_single_image(filepath):
    img = Image.open(filepath)
    output_images = []
    output_masks = []
    w, h = None, None

    for i in ImageSequence.Iterator(img):
        i = ImageOps.exif_transpose(i)
        image = i.convert("RGB")
        if len(output_images) == 0:
            w = image.size[0]
            h = image.size[1]
        if image.size[0] != w or image.size[1] != h:
            continue
        image_np = np.array(image).astype(np.float32) / 255.0
        image_t = torch.from_numpy(image_np)[None,]
        if 'A' in i.getbands():
            mask_np = np.array(i.getchannel('A')).astype(np.float32) / 255.0
            mask_t = 1. - torch.from_numpy(mask_np)
        else:
            mask_t = torch.zeros((64, 64), dtype=torch.float32)
        output_images.append(image_t)
        output_masks.append(mask_t.unsqueeze(0))

    if len(output_images) > 1:
        out_img = torch.cat(output_images, dim=0)
        out_mask = torch.cat(output_masks, dim=0)
    else:
        out_img = output_images[0]
        out_mask = output_masks[0]
    return out_img, out_mask


def _send_info(info_str):
    try:
        PromptServer.instance.send_sync("folder-loader-info", {"info": info_str})
    except Exception:
        pass


def _register_api():
    """注册 /folder-loader-scan API 端点（按钮扫描用）"""
    global _api_registered
    if _api_registered:
        return
    _api_registered = True

    @PromptServer.instance.routes.post("/folder-loader-scan")
    async def scan_folder_handler(request):
        try:
            data = await request.json()
            folder_path = data.get("folder_path", "").strip().strip("\"'")
            files = _get_image_files(folder_path)
            total = len(files)
            loaded = _FOLDER_ITERATORS.get(folder_path, 0)
            remaining = max(0, total - loaded)
            info = f"scan|{total}|{loaded}|{remaining}|{folder_path}"
            _send_info(info)
            return web.json_response({
                "success": True, "total": total,
                "loaded": loaded, "remaining": remaining
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})


try:
    _register_api()
except Exception:
    pass


# ============================================================================
# 节点
# ============================================================================

class SequentialFolderImageLoader:
    """
    📁 文件夹图片加载器
    每 Queue 一次，加载下一张图片。
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_path": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "📂 图片文件夹绝对路径，如 D:/my_photos"
                }),
                "index": ("INT", {
                    "default": -1,
                    "min": -1,
                    "max": 999999,
                    "step": 1,
                    "tooltip": "-1=自动模式（每执行一次自动+1），0+=手动指定索引"
                }),
                "reset": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "🔄 重置到第一张（只触发一次，之后自动恢复正常迭代）"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "load_image"
    CATEGORY = "文件夹工具"

    @classmethod
    def IS_CHANGED(cls, folder_path, index=-1, reset=False):
        import time
        return time.time()

    def load_image(self, folder_path, index=-1, reset=False):
        folder_path = folder_path.strip().strip("\"'")
        files = _get_image_files(folder_path)
        total = len(files)

        empty_img = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
        empty_mask = torch.zeros((1, 64, 64), dtype=torch.float32)

        if total == 0:
            _send_info(f"scan|0|0|0|{folder_path}")
            raise ValueError(f"❌ 文件夹中未找到图片: {folder_path}")

        # ---- 优先级：index>=1 直接加载 > reset重置 > index=-1自动递增 ----
        if index >= 1:
            # 手动指定：输入 N = 加载第 N 张（1-based），不更新迭代器
            idx = max(0, min(index - 1, total - 1))
        else:
            # 自动模式（-1）或 reset
            reset_key = f"_reset_applied_{folder_path}"
            if reset:
                if not _RESET_STATE.get(reset_key, False):
                    _FOLDER_ITERATORS[folder_path] = 0
                    _RESET_STATE[reset_key] = True
            else:
                _RESET_STATE[reset_key] = False

            idx = _FOLDER_ITERATORS.get(folder_path, 0)
            if idx >= total:
                idx = 0
            _FOLDER_ITERATORS[folder_path] = idx + 1

        fname = files[idx]
        fpath = os.path.join(folder_path, fname)
        image_tensor, mask_tensor = _load_single_image(fpath)

        loaded_count = min(_FOLDER_ITERATORS.get(folder_path, 1), total)
        remaining_count = max(0, total - loaded_count)

        print(f"[文件夹加载器] ✅ ({idx+1}/{total}) 已加载:{loaded_count} 剩余:{remaining_count} {fname}")

        info = f"load|{total}|{idx}|{loaded_count}|{remaining_count}|{fname}|{folder_path}"
        _send_info(info)

        return (image_tensor, mask_tensor)


NODE_CLASS_MAPPINGS = {
    "SequentialFolderImageLoader": SequentialFolderImageLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SequentialFolderImageLoader": "📁 文件夹图片加载器",
}
