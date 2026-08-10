"""
@title: 文件夹顺序图片加载器
@description: 与 ComfyUI LoadImage 一致，支持文件夹逐张迭代
"""

from .folder_image_loader import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
