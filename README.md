# 📁 ComfyUI Folder Image Loader

<img width="1738" height="518" alt="image" src="https://github.com/user-attachments/assets/68ec0a68-d6dd-4284-9653-3290e5eea635" />

> 顺序加载文件夹中的图片，每次 Queue 一张，自动迭代，适用于批量处理工作流。

[![ComfyUI](https://img.shields.io/badge/ComfyUI-0.30+-blue)](https://github.com/comfyanonymous/ComfyUI)
[![Python](https://img.shields.io/badge/Python-3.10+-green)](https://www.python.org/)

---

## ✨ 功能特点

| 功能 | 说明 |
|------|------|
| 📂 **文件夹批量加载** | 指定文件夹路径，自动扫描所有图片 |
| 🔄 **自动迭代** | 每次 Queue Prompt 自动加载下一张，处理完所有图片后自动回到第一张 |
| 🔍 **一键扫描** | 节点内置"确认扫描"按钮，点击即可查看文件夹图片统计信息 |
| 📊 **实时进度面板** | 节点内嵌信息面板，显示图片总数、已加载数量、剩余数量、当前进度 |
| 🎯 **手动指定索引** | 支持输入指定索引直接跳转到某张图片（1-based） |
| 🖼️ **兼容 LoadImage** | 输出格式与 ComfyUI 原生 LoadImage 完全一致（IMAGE + MASK） |
| 🌐 **中文界面** | 节点名称、分类、按钮、进度面板全部中文显示 |

---

## 📸 效果预览

```
╔══════════════════════════════════════════╗
║  📁 文件夹图片加载器                      ║
╠══════════════════════════════════════════╣
║  输出: image ●  mask ●                   ║
║                                          ║
║  folder_path  [C:\Users\...\AI图片]      ║
║  index         ◄ -1 ►                    ║
║  reset         [○]                       ║
║                                          ║
║  ┌──────────────────────────────────┐    ║
║  │  ✅ 当前进度                      │    ║
║  │  📊 进度          5 / 23         │    ║
║  │  ✅ 已加载        5              │    ║
║  │  ⏳ 剩余          18             │    ║
║  │  [████████░░░░░░░░░░░░]          │    ║
║  │  📄 ComfyUI_temp_00005_.png     │    ║
║  └──────────────────────────────────┘    ║
║                                          ║
║  ┌──────────────────────────────────┐    ║
║  │      🔍 确认扫描                  │    ║
║  └──────────────────────────────────┘    ║
╚══════════════════════════════════════════╝
```

---

## 🛠️ 安装方法

### 方法一：Git Clone（推荐）

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/git-squirrel/comfyui-folder-image-loader.git
```

### 方法二：手动下载

1. 下载本仓库 ZIP 文件
2. 解压到 `ComfyUI/custom_nodes/` 目录下
3. 确保目录结构为：
```
ComfyUI/custom_nodes/comfyui-folder-image-loader/
├── __init__.py
├── folder_image_loader.py
└── js/
    └── folder_image_loader.js
└── workflows/
    └── SeedVR2.5高清放大工作流.json
```
### SeedVR2批量-4K高清放大-工作流
<img width="1734" height="508" alt="image" src="https://github.com/user-attachments/assets/8dce72c6-23b9-4481-9012-6bd10ffad93b" />


### 依赖

无额外依赖，使用 ComfyUI 自带的 PyTorch 和 PIL。

---

## 📖 使用说明

### 基本使用

1. **添加节点**：右键画布 → `文件夹工具` → `📁 文件夹图片加载器`
2. **设置路径**：在 `folder_path` 输入图片文件夹的绝对路径（如 `D:/my_photos`）
3. **点击扫描**：点击节点下方的 `🔍 确认扫描` 按钮，查看文件夹中的图片数量
4. **连接节点**：将 `image` 和 `mask` 输出连接到后续处理节点（如 SaveImage、Apply LoRA 等）
5. **开始处理**：点击 Queue Prompt，每次执行自动加载一张图片

### 输入参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `folder_path` | STRING | `""` | 图片文件夹绝对路径 |
| `index` | INT | `-1` | `-1` = 自动模式（每次+1）；`≥1` = 直接加载第 N 张（不自动递增） |
| `reset` | BOOLEAN | `False` | 重置到第一张（触发一次后自动恢复正常迭代） |

### 输出

| 输出 | 类型 | 说明 |
|------|------|------|
| `image` | IMAGE | `(1, H, W, 3)` RGB 图片张量 |
| `mask` | MASK | `(1, H, W)` 反转 alpha 通道（1=透明, 0=不透明） |

### 操作示例

#### 自动批量处理（默认模式）

```
index = -1, reset = False
```

- 第 1 次 Queue → 加载第 1 张
- 第 2 次 Queue → 加载第 2 张
- ...
- 第 N 次 Queue → 加载第 N 张（到最后一张后自动回到第1张）

#### 手动指定图片

```
index = 5, reset = False
```

- 每次 Queue 都加载第 5 张图片
- 不会自动递增，始终加载同一张

#### 重置到第一张

```
index = -1, reset = True
```

- 第 1 次 Queue → 回到第 1 张
- 第 2 次 Queue → 加载第 2 张（自动恢复正常迭代，无需手动取消 reset）

---

## 🔧 技术细节

### 图片加载逻辑

与 ComfyUI 原生 `LoadImage` 完全一致：
- 使用 `PIL.Image.open()` 读取图片
- 通过 `ImageOps.exif_transpose()` 处理 EXIF 旋转
- 输出 `(1, H, W, 3)` float32 RGB 张量
- 输出 `(1, H, W)` float32 反转 alpha mask

### 支持的图片格式

`.png` `.jpg` `.jpeg` `.webp` `.bmp` `.tiff` `.tif`

### 排序方式

自然排序（Natural Sort），正确处理数字文件名：
```
img_1.png → img_2.png → img_10.png → img_20.png
```

### 前端扩展

节点内置 JavaScript 前端扩展（`js/` 目录），提供：
- `🔍 确认扫描` 按钮：直接调用 API 端点扫描文件夹
- 进度信息面板：实时显示加载进度，嵌入节点内部

---

## 📝 工作流示例

### 批量图片处理

```
[📁 文件夹图片加载器] → [你的处理节点] → [💾 SaveImage]
       ↓
    index = -1
```

### 手动选择特定图片

```
[📁 文件夹图片加载器] → [你的处理节点] → [💾 SaveImage]
       ↓
    index = 5  (加载第5张)
```

---

## ❓ 常见问题

**Q: 节点找不到？**
A: 重启 ComfyUI，确保目录结构正确。

**Q: 图片加载失败？**
A: 检查文件夹路径是否正确，路径使用绝对路径（如 `D:/my_photos`），支持正斜杠和反斜杠。

**Q: 扫描按钮没反应？**
A: 确保 ComfyUI 版本 ≥ 0.30，检查浏览器控制台是否有错误。

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - 节点式 AI 工作流
